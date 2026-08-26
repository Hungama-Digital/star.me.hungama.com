from __future__ import annotations

import json
import math
import subprocess
import tempfile
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from starme.config import Settings
from starme.face_qa import EmbedFn, WindowVerdict, judge_window, reference_embedding
from starme.media_pipeline import probe_media, remux_original_audio, structural_quality_report
from starme.render_pipeline import SeedanceRenderSpec, execute_seedance_render

# All current masters are 24 fps portrait.
_FPS = 24

# Seedance 2.5 edit tasks reject reference videos outside this range
# (verified against the live API on 21 August 2026).
MIN_PROVIDER_SECONDS = 4.0
MAX_PROVIDER_SECONDS = 15.0
# Windows longer than ~8s exhibited within-window identity drift in the
# 21-22 August product reviews; batches target this size.
BATCH_TARGET_SECONDS = 8.0
# Above this share of a frame left flat white, the fill stage did not cover
# the mask and the roll is rejected. Measured leaks were 7%; scenes with real
# highlights sit near 1%.
MAX_UNFILLED_MASK_PERCENT = 1.5
# The proven Seedance render tier; provider inputs are cut to this size so the
# render pipeline's structural gate compares source and output like for like.
PROVIDER_WIDTH, PROVIDER_HEIGHT = 720, 1280

RenderFn = Callable[[dict[str, Any], Settings], dict[str, Any]]


class EpisodeAssemblyError(RuntimeError):
    pass


@dataclass(frozen=True)
class Shot:
    """One content-owner-designated window inside an episode master."""

    episode: int
    clip: str
    start: float
    duration: float
    characters: tuple[str, ...]

    @property
    def end(self) -> float:
        return self.start + self.duration


@dataclass(frozen=True)
class Segment:
    kind: str  # "keep" or "swap"
    start: float
    end: float
    clip: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start


def load_shot_manifest(path: Path) -> list[Shot]:
    """Parse the content-owner shot manifest (episode/clip/start/duration/characters)."""
    entries = json.loads(path.read_text())
    if not isinstance(entries, list):
        raise EpisodeAssemblyError("Shot manifest must be a JSON list")
    shots = []
    for entry in entries:
        shots.append(
            Shot(
                episode=int(entry["episode"]),
                clip=str(entry["clip"]),
                start=float(entry["start"]),
                duration=float(entry["duration"]),
                characters=tuple(
                    part.strip() for part in str(entry["characters"]).split(",") if part.strip()
                ),
            )
        )
    return shots


def shots_for_episode(shots: list[Shot], episode: int, role_character: str) -> list[Shot]:
    """The designated role's shots for one episode, ordered and validated."""
    selected = sorted(
        (
            shot
            for shot in shots
            if shot.episode == episode
            and any(role_character.lower() == name.lower() for name in shot.characters)
        ),
        key=lambda shot: shot.start,
    )
    for earlier, later in zip(selected, selected[1:], strict=False):
        if later.start < earlier.end:
            raise EpisodeAssemblyError(
                f"Shots {earlier.clip} and {later.clip} overlap; fix the manifest"
            )
    return selected


def batch_shots(
    shots: list[Shot],
    *,
    min_seconds: float = MIN_PROVIDER_SECONDS,
    max_seconds: float = BATCH_TARGET_SECONDS,
) -> list[list[Shot]]:
    """Group designated shots into provider-sized batches.

    This reproduces the approved 20 August mechanism: only designated footage
    is ever sent to the provider, short shots ride with their neighbours as
    hard cuts, and batches stay small because long windows drift.
    """
    if not shots:
        return []
    batches: list[list[Shot]] = []
    current: list[Shot] = []
    current_duration = 0.0
    for shot in shots:
        if shot.duration > MAX_PROVIDER_SECONDS:
            raise EpisodeAssemblyError(
                f"Shot {shot.clip} is {shot.duration:.1f}s; the provider accepts at most "
                f"{MAX_PROVIDER_SECONDS:.0f}s - split it in the manifest"
            )
        if current and current_duration + shot.duration > max_seconds:
            batches.append(current)
            current, current_duration = [], 0.0
        current.append(shot)
        current_duration += shot.duration
    batches.append(current)

    def duration(batch: list[Shot]) -> float:
        return sum(shot.duration for shot in batch)

    # Repair pass: no batch may sit under the provider minimum, wherever it
    # falls in the sequence. Merge with a neighbour when the result stays
    # within the hard provider ceiling, otherwise borrow a neighbouring shot.
    index = 0
    while index < len(batches):
        if duration(batches[index]) >= min_seconds:
            index += 1
            continue
        if len(batches) == 1:
            raise EpisodeAssemblyError(
                f"Designated footage totals {duration(batches[0]):.1f}s; the provider "
                f"needs at least {min_seconds:.0f}s"
            )
        neighbour = index + 1 if index + 1 < len(batches) else index - 1
        if duration(batches[neighbour]) + duration(batches[index]) <= MAX_PROVIDER_SECONDS:
            if neighbour > index:
                batches[index].extend(batches.pop(neighbour))
            else:
                batches[neighbour].extend(batches.pop(index))
                index = neighbour
        elif neighbour > index:
            batches[index].append(batches[neighbour].pop(0))
        else:
            batches[index].insert(0, batches[neighbour].pop())
    return batches


def plan_segments(total_duration: float, shots: list[Shot]) -> list[Segment]:
    """Alternate keep/swap segments covering the full episode exactly once."""
    segments: list[Segment] = []
    cursor = 0.0
    for shot in shots:
        if shot.start < cursor:
            raise EpisodeAssemblyError(f"Shot {shot.clip} starts before the running cursor")
        if shot.end > total_duration + 0.05:
            raise EpisodeAssemblyError(f"Shot {shot.clip} extends past the episode master")
        if shot.start > cursor:
            segments.append(Segment("keep", cursor, shot.start))
        segments.append(Segment("swap", shot.start, min(shot.end, total_duration), shot.clip))
        cursor = shot.end
    if cursor < total_duration:
        segments.append(Segment("keep", cursor, total_duration))
    return segments


def _run(command: list[str]) -> None:
    completed = subprocess.run(command, capture_output=True, text=True, check=False)  # noqa: S603
    if completed.returncode != 0:
        raise EpisodeAssemblyError(f"{command[0]} failed: {completed.stderr[-400:]}")


_ENCODE = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p"]


def _cut_av(
    source: Path, start: float, duration: float, destination: Path, *, width: int, height: int
) -> Path:
    """Cut a shot with its audio, conformed to one encoding format."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        ["ffmpeg", "-y", "-ss", str(start), "-i", str(source), "-t", str(duration)]
        + ["-vf", f"scale={width}:{height},fps={_FPS}"]
        + _ENCODE
        + ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(destination)]
    )
    return destination


def _cut_video(
    source: Path, start: float, duration: float, destination: Path, *, width: int, height: int
) -> Path:
    """Silent conformed video cut (keep segments in the final timeline)."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        ["ffmpeg", "-y", "-ss", str(start), "-i", str(source), "-t", str(duration)]
        + ["-map", "0:v:0", "-an", "-vf", f"scale={width}:{height},fps={_FPS}"]
        + _ENCODE
        + ["-movflags", "+faststart", str(destination)]
    )
    return destination


def _cut_piece_exact(
    source: Path, start: float, duration: float, destination: Path, *, width: int, height: int
) -> Path:
    """Cut one shot's piece out of a swapped batch at its exact source duration.

    The provider can return a slightly short batch; cloning the final frame
    absorbs the shortfall so the assembled timeline never drifts.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        ["ffmpeg", "-y", "-ss", str(start), "-i", str(source), "-t", str(duration)]
        + [
            "-an",
            "-vf",
            f"scale={width}:{height},fps={_FPS},tpad=stop_mode=clone:stop_duration=5",
        ]
        + _ENCODE
        + ["-movflags", "+faststart", str(destination)]
    )
    return destination


def _pad_to_whole_second(source: Path, destination: Path, seconds: float) -> int:
    """Hold the last frame out to the next whole second. Returns that second.

    Only the masked pipeline needs this, and only because Seedance 2.0 takes an
    explicit integer duration: asked for 8 seconds against 7.64 of footage it
    returned 8.04, the extra four tenths invented outright. Padding means every
    second asked for is covered by real material, and the caller trims the hold
    back off afterwards. Seedance 2.5 infers duration and needs none of this.
    """
    whole = max(int(MIN_PROVIDER_SECONDS), int(math.ceil(seconds - 0.001)))
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        ["ffmpeg", "-y", "-i", str(source)]
        + ["-vf", f"tpad=stop_mode=clone:stop_duration={whole},fps={_FPS},"
                  f"scale={PROVIDER_WIDTH}:{PROVIDER_HEIGHT}"]
        + ["-t", str(whole), "-an"]
        + _ENCODE
        + ["-movflags", "+faststart", str(destination)]
    )
    return whole


def _trim_to(source: Path, destination: Path, seconds: float) -> Path:
    """Cut a padded render back to the footage it was built from."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        ["ffmpeg", "-y", "-i", str(source), "-t", f"{seconds:.3f}", "-an"]
        + _ENCODE
        + ["-movflags", "+faststart", str(destination)]
    )
    return destination


def unfilled_mask_percentage(swapped: Path, source: Path, *, interval: float = 0.25) -> float:
    """Worst share of a frame the fill stage left flat white.

    The masked pipeline's own failure mode, impossible in a direct edit: stage
    three sometimes does not paint over the whole mask and the white patch from
    stage one sits on the face. It happened for half a second at the head of one
    batch on 26 August and only a frame-level look caught it.

    Measured as white in the output where the source is not white, so a scene
    with real bright highlights does not read as a leak.
    """
    import cv2  # noqa: PLC0415

    worst = 0.0
    with tempfile.TemporaryDirectory() as scratch:
        out_dir, src_dir = Path(scratch) / "out", Path(scratch) / "src"
        for folder, video in ((out_dir, swapped), (src_dir, source)):
            folder.mkdir(parents=True, exist_ok=True)
            _run(
                ["ffmpeg", "-y", "-i", str(video), "-vf", f"fps=1/{interval}"]
                + ["-q:v", "3", str(folder / "f%04d.jpg")]
            )
        for out_frame, src_frame in zip(
            sorted(out_dir.glob("*.jpg")), sorted(src_dir.glob("*.jpg")), strict=False
        ):
            out = cv2.imread(str(out_frame), cv2.IMREAD_GRAYSCALE)
            src = cv2.imread(str(src_frame), cv2.IMREAD_GRAYSCALE)
            if out is None or src is None:
                continue
            src = cv2.resize(src, (out.shape[1], out.shape[0]))
            # Thresholds rather than numpy maths: cv2 is already a
            # dependency and this keeps the module import-light.
            white = cv2.threshold(out, 235, 255, cv2.THRESH_BINARY)[1]
            dark_in_source = cv2.threshold(src, 199, 255, cv2.THRESH_BINARY_INV)[1]
            leaked = cv2.bitwise_and(white, dark_in_source)
            pixels = out.shape[0] * out.shape[1]
            worst = max(worst, cv2.countNonZero(leaked) / pixels * 100)
    return worst


def _concat_encode(parts: list[Path], destination: Path, *, width: int, height: int) -> Path:
    """Concatenate parts with a re-encode.

    Stream-copy concat corrupts when segment encoder parameters differ (live
    failure on 21 August 2026); a single re-encode normalises everything.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    listing = destination.with_suffix(".concat.txt")
    listing.write_text("".join(f"file '{path}'\n" for path in parts))
    probe = probe_media(parts[0])
    audio = ["-c:a", "aac", "-b:a", "192k"] if probe.has_audio else ["-an"]
    _run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing)]
        + ["-vf", f"scale={width}:{height},fps={_FPS}"]
        + _ENCODE
        + audio
        + ["-movflags", "+faststart", str(destination)]
    )
    return destination


def _extract_audio(video: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        ["ffmpeg", "-y", "-i", str(video), "-map", "0:a:0", "-vn"]
        + ["-c:a", "aac", "-b:a", "192k", str(destination)]
    )
    return destination


def _extract_frame(video: Path, at_seconds: float, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        ["ffmpeg", "-y", "-ss", str(at_seconds), "-i", str(video)]
        + ["-frames:v", "1", "-q:v", "2", str(destination)]
    )
    return destination


def _render_with_retry(
    render: RenderFn, spec_data: dict[str, Any], settings: Settings, attempts: int = 2
) -> dict[str, Any]:
    """Provider output moderation is stochastic; one retry often clears it."""
    last: Exception | None = None
    for _ in range(attempts):
        try:
            return render(spec_data, settings)
        except Exception as exc:  # noqa: BLE001 - retried, then surfaced to the caller
            last = exc
    raise last if last else RuntimeError("render failed")


def _swap_batch_once(
    *,
    master: Path,
    batch: list[Shot],
    work_dir: Path,
    reference: str,
    face_asset_uri: str,
    subject_video_desc: str,
    extra_notes: str,
    settings: Settings,
    render: RenderFn,
    piece_width: int,
    piece_height: int,
) -> dict[str, Path]:
    """One provider roll: swap a batch of designated shots and split it back."""
    parts = [
        _cut_av(
            master,
            shot.start,
            shot.duration,
            work_dir / f"{reference}-in{index:02d}.mp4",
            width=PROVIDER_WIDTH,
            height=PROVIDER_HEIGHT,
        )
        for index, shot in enumerate(batch)
    ]
    if len(parts) == 1:
        batch_input = parts[0]
    else:
        batch_input = _concat_encode(
            parts,
            work_dir / f"{reference}-input.mp4",
            width=PROVIDER_WIDTH,
            height=PROVIDER_HEIGHT,
        )
    batch_audio = _extract_audio(batch_input, work_dir / f"{reference}-audio.m4a")
    true_span = probe_media(batch_input).duration_seconds
    # The masked pipeline runs on Seedance 2.0, which takes an explicit integer
    # duration and invents footage for any second the input does not cover. Pad
    # to a whole second, ask for exactly that, trim the hold back off. The
    # direct path runs on 2.5, which infers duration, so it sends the cut as-is.
    masked = settings.render_method == "masked"
    provider_input = batch_input
    asked: int | None = None
    if masked:
        padded = work_dir / f"{reference}-padded.mp4"
        asked = _pad_to_whole_second(batch_input, padded, true_span)
        provider_input = padded
    spec = SeedanceRenderSpec(
        reference=reference,
        source_video_url="",
        source_video_path=str(provider_input),
        original_audio_path=str(batch_audio),
        reference_asset_uris=(face_asset_uri,),
        subject_video_desc=subject_video_desc,
        extra_notes=extra_notes,
        duration=asked,
    )
    result = _render_with_retry(render, asdict(spec), settings)
    generated = Path(str(result["generated_video_path"]))
    if masked:
        leak = unfilled_mask_percentage(generated, provider_input)
        if leak > MAX_UNFILLED_MASK_PERCENT:
            raise EpisodeAssemblyError(
                f"Batch {reference}: the fill stage left {leak:.1f}% of a frame as "
                "unfilled white mask"
            )
        generated = _trim_to(generated, work_dir / f"{reference}-trimmed.mp4", true_span)
    swapped: dict[str, Path] = {}
    offset = 0.0
    for index, shot in enumerate(batch):
        swapped[shot.clip] = _cut_piece_exact(
            generated,
            offset,
            shot.duration,
            work_dir / f"{reference}-out{index:02d}.mp4",
            width=piece_width,
            height=piece_height,
        )
        offset += shot.duration
    return swapped


def _judge_pieces(
    pieces: dict[str, Path],
    reference_face: list[float] | None,
    embedder: EmbedFn | None,
    *,
    masters: dict[str, Path] | None = None,
    lead_reference: list[float] | None = None,
) -> tuple[bool, dict[str, WindowVerdict]]:
    if reference_face is None:
        return True, {}
    masters = masters or {}
    verdicts = {
        clip: judge_window(
            path,
            reference_face,
            master=masters.get(clip),
            lead_reference=lead_reference,
            embedder=embedder,
        )
        for clip, path in pieces.items()
    }
    return all(verdict.passed for verdict in verdicts.values()), verdicts


def _master_pieces(
    master: Path, batch: list[Shot], work_dir: Path, reference: str, *, width: int, height: int
) -> dict[str, Path]:
    """The same windows cut from the untouched master, for QA to compare against."""
    return {
        shot.clip: _cut_video(
            master,
            shot.start,
            shot.duration,
            work_dir / f"{reference}-src{index:02d}.mp4",
            width=width,
            height=height,
        )
        for index, shot in enumerate(batch)
    }


def _swap_batch_verified(
    *,
    master: Path,
    batch: list[Shot],
    work_dir: Path,
    reference: str,
    face_asset_uri: str,
    subject_video_desc: str,
    extra_notes: str,
    settings: Settings,
    render: RenderFn,
    piece_width: int,
    piece_height: int,
    reference_face: list[float] | None,
    embedder: EmbedFn | None,
    max_rolls: int,
    lead_reference: list[float] | None = None,
) -> tuple[dict[str, Path], dict[str, Any]]:
    """Roll a batch up to max_rolls until every piece passes face QA.

    Automates the 21-22 August manual loop: render, judge every piece against
    the subscriber reference, and re-roll on wrong-identity or double-swap
    verdicts. Fails closed when no roll passes - never ship the wrong face.
    """
    cache_file = work_dir / f"{reference}-verified.json"
    if cache_file.is_file():
        cached = json.loads(cache_file.read_text())
        paths = {clip: Path(p) for clip, p in cached["pieces"].items()}
        if all(path.is_file() for path in paths.values()):
            return paths, cached["report"]
    last_error: str = ""
    for roll in range(max_rolls):
        roll_dir = work_dir / f"{reference}-roll{roll}"
        roll_dir.mkdir(parents=True, exist_ok=True)
        try:
            pieces = _swap_batch_once(
                master=master,
                batch=batch,
                work_dir=roll_dir,
                reference=f"{reference}-r{roll}",
                face_asset_uri=face_asset_uri,
                subject_video_desc=subject_video_desc,
                extra_notes=extra_notes,
                settings=settings,
                render=render,
                piece_width=piece_width,
                piece_height=piece_height,
            )
        except Exception as exc:  # noqa: BLE001 - roll again; surfaced when rolls run out
            last_error = str(exc)
            continue
        masters = (
            _master_pieces(
                master, batch, roll_dir, reference, width=piece_width, height=piece_height
            )
            if reference_face is not None and lead_reference is not None
            else None
        )
        passed, verdicts = _judge_pieces(
            pieces,
            reference_face,
            embedder,
            masters=masters,
            lead_reference=lead_reference,
        )
        report = {
            "rolls_used": roll + 1,
            "face_qa": {clip: asdict(verdict) for clip, verdict in verdicts.items()},
        }
        if passed:
            cache_file.write_text(
                json.dumps(
                    {"pieces": {clip: str(p) for clip, p in pieces.items()}, "report": report}
                )
            )
            return pieces, report
        last_error = "; ".join(
            f"{clip}: {'; '.join(verdict.notes)}"
            for clip, verdict in verdicts.items()
            if not verdict.passed
        )
    raise EpisodeAssemblyError(
        f"Batch {reference} failed face QA after {max_rolls} rolls: {last_error}"
    )


def assemble_episode(
    *,
    master: Path,
    shots: list[Shot],
    work_dir: Path,
    destination: Path,
    face_asset_uri: str,
    subject_video_desc: str,
    extra_notes: str = "",
    reference_prefix: str,
    settings: Settings,
    render: RenderFn = execute_seedance_render,
    reference_portrait: Path | None = None,
    lead_portrait: Path | None = None,
    embedder: EmbedFn | None = None,
) -> dict[str, Any]:
    """Swap the designated role's shots and rebuild the full episode.

    Only designated footage reaches the provider (batched like the approved
    20 August run, capped at the drift-safe window size); every swapped piece
    must pass face-identity QA against the subscriber's reference portrait
    (with re-rolls) before it may enter the timeline; untouched footage is
    preserved at the master's resolution; the final stitch is one re-encode;
    and the complete original episode audio is remuxed on.
    """
    if not shots:
        raise EpisodeAssemblyError("No designated shots for this episode")
    work_dir.mkdir(parents=True, exist_ok=True)
    master_probe = probe_media(master)
    width, height = master_probe.width, master_probe.height
    segments = plan_segments(master_probe.duration_seconds, shots)

    reference_face = None
    lead_face = None
    if reference_portrait is not None and settings.face_qa_enabled:
        reference_face = reference_embedding(reference_portrait, embedder)
        # Optional, and the gate is materially weaker without it: with no
        # picture of the original lead, QA can only ask whether the
        # subscriber's face is present, which a wrongly replaced co-star
        # answers correctly.
        if lead_portrait is not None and lead_portrait.is_file():
            lead_face = reference_embedding(lead_portrait, embedder)

    pieces: dict[str, Path] = {}
    qa_reports: dict[str, Any] = {}
    for index, batch in enumerate(batch_shots(shots)):
        batch_pieces, batch_report = _swap_batch_verified(
            master=master,
            batch=batch,
            work_dir=work_dir,
            reference=f"{reference_prefix}-batch{index:02d}",
            face_asset_uri=face_asset_uri,
            subject_video_desc=subject_video_desc,
            extra_notes=extra_notes,
            settings=settings,
            render=render,
            piece_width=width,
            piece_height=height,
            reference_face=reference_face,
            embedder=embedder,
            max_rolls=settings.render_max_rolls,
            lead_reference=lead_face,
        )
        pieces.update(batch_pieces)
        qa_reports[f"batch{index:02d}"] = batch_report

    timeline: list[Path] = []
    for index, segment in enumerate(segments):
        if segment.kind == "swap":
            timeline.append(pieces[segment.clip])
            continue
        timeline.append(
            _cut_video(
                master,
                segment.start,
                segment.duration,
                work_dir / f"{reference_prefix}-seg{index:02d}.mp4",
                width=width,
                height=height,
            )
        )

    silent = _concat_encode(
        timeline,
        work_dir / f"{reference_prefix}-assembled-silent.mp4",
        width=width,
        height=height,
    )
    audio = _extract_audio(master, work_dir / f"{reference_prefix}-original.m4a")
    final = remux_original_audio(silent, audio, destination)
    report = structural_quality_report(master, final)
    if not report.passed:
        raise EpisodeAssemblyError(f"Assembled episode failed structural gates: {report.checks}")
    return {
        "final_video_path": str(final),
        "segments": len(segments),
        "swapped_segments": sum(1 for segment in segments if segment.kind == "swap"),
        "provider_batches": len(batch_shots(shots)),
        "face_qa_enabled": reference_face is not None,
        "lead_aware_qa": lead_face is not None,
        "face_qa": qa_reports,
        "quality_checks": report.checks,
    }


def render_first_look(
    *,
    master: Path,
    shots: list[Shot],
    work_dir: Path,
    destination: Path,
    face_asset_uri: str,
    subject_video_desc: str,
    extra_notes: str = "",
    reference: str,
    settings: Settings,
    render: RenderFn = execute_seedance_render,
    reference_portrait: Path | None = None,
    lead_portrait: Path | None = None,
    embedder: EmbedFn | None = None,
) -> Path:
    """Swap the first provider batch (QA-verified) and deliver its midpoint frame."""
    if not shots:
        raise EpisodeAssemblyError("No designated shots for the first look")
    work_dir.mkdir(parents=True, exist_ok=True)
    reference_face = None
    lead_face = None
    if reference_portrait is not None and settings.face_qa_enabled:
        reference_face = reference_embedding(reference_portrait, embedder)
        # Optional, and the gate is materially weaker without it: with no
        # picture of the original lead, QA can only ask whether the
        # subscriber's face is present, which a wrongly replaced co-star
        # answers correctly.
        if lead_portrait is not None and lead_portrait.is_file():
            lead_face = reference_embedding(lead_portrait, embedder)
    first_batch = batch_shots(shots)[0]
    pieces, _ = _swap_batch_verified(
        master=master,
        batch=first_batch,
        work_dir=work_dir,
        reference=reference,
        face_asset_uri=face_asset_uri,
        subject_video_desc=subject_video_desc,
        extra_notes=extra_notes,
        settings=settings,
        render=render,
        piece_width=PROVIDER_WIDTH,
        piece_height=PROVIDER_HEIGHT,
        reference_face=reference_face,
        embedder=embedder,
        max_rolls=settings.render_max_rolls,
        lead_reference=lead_face,
    )
    first = first_batch[0]
    return _extract_frame(pieces[first.clip], first.duration / 2, destination)
