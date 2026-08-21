from __future__ import annotations

import json
import subprocess
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from starme.config import Settings
from starme.media_pipeline import probe_media, remux_original_audio, structural_quality_report
from starme.render_pipeline import SeedanceRenderSpec, execute_seedance_render

# All current masters are 24 fps portrait.
_FPS = 24

# Seedance 2.5 edit tasks reject reference videos outside this range
# (verified against the live API on 21 August 2026).
MIN_PROVIDER_SECONDS = 4.0
MAX_PROVIDER_SECONDS = 15.0
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
    max_seconds: float = MAX_PROVIDER_SECONDS,
) -> list[list[Shot]]:
    """Group designated shots into provider-sized batches.

    This reproduces the mechanism of the product-approved 20 August run: only
    designated footage is ever sent to the provider, and short shots ride in
    the same clip as their neighbours (a hard cut between shots, which the
    edit model handles) instead of dragging in non-designated frames.
    """
    if not shots:
        return []
    batches: list[list[Shot]] = []
    current: list[Shot] = []
    current_duration = 0.0
    for shot in shots:
        if shot.duration > max_seconds:
            raise EpisodeAssemblyError(
                f"Shot {shot.clip} is {shot.duration:.1f}s; the provider accepts at most "
                f"{max_seconds:.0f}s - split it in the manifest"
            )
        if current and current_duration + shot.duration > max_seconds:
            batches.append(current)
            current, current_duration = [], 0.0
        current.append(shot)
        current_duration += shot.duration
    batches.append(current)
    last_duration = sum(shot.duration for shot in batches[-1])
    if last_duration < min_seconds:
        if len(batches) == 1:
            raise EpisodeAssemblyError(
                f"Designated footage totals {last_duration:.1f}s; the provider needs at least "
                f"{min_seconds:.0f}s"
            )
        if sum(shot.duration for shot in batches[-2]) + last_duration <= max_seconds:
            batches[-2].extend(batches.pop())
        else:
            batches[-1].insert(0, batches[-2].pop())
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


def _swap_batch(
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
    """Swap one batch of designated shots and split it back into exact pieces.

    Mirrors the approved 20 August run: the provider receives a single clip
    made only of designated footage (hard cuts between shots), and the swapped
    result is split at the known shot boundaries afterwards.
    """
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
    spec = SeedanceRenderSpec(
        reference=reference,
        source_video_url="",
        source_video_path=str(batch_input),
        original_audio_path=str(batch_audio),
        reference_asset_uris=(face_asset_uri,),
        subject_video_desc=subject_video_desc,
        extra_notes=extra_notes,
    )
    try:
        result = _render_with_retry(render, asdict(spec), settings)
    except Exception:
        if len(batch) > 1:
            # Isolate the offending shot: render each one alone. Shots below
            # the provider minimum cannot stand alone and fall back unswapped.
            pieces: dict[str, Path] = {}
            for shot in batch:
                if shot.duration >= MIN_PROVIDER_SECONDS:
                    pieces.update(
                        _swap_batch(
                            master=master,
                            batch=[shot],
                            work_dir=work_dir,
                            reference=f"{reference}-{shot.clip}",
                            face_asset_uri=face_asset_uri,
                            subject_video_desc=subject_video_desc,
                            extra_notes=extra_notes,
                            settings=settings,
                            render=render,
                            piece_width=piece_width,
                            piece_height=piece_height,
                        )
                    )
            return pieces
        # A single shot the provider keeps refusing: fall back to the
        # original footage rather than failing the whole episode. The
        # assembler records the compromise for QA.
        return {}
    generated = Path(str(result["generated_video_path"]))
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
) -> dict[str, Any]:
    """Swap the designated role's shots and rebuild the full episode.

    Only designated footage reaches the provider (batched exactly like the
    approved 20 August run); untouched footage is preserved verbatim at the
    master's resolution; the final stitch is a single re-encode; and the
    complete original episode audio is remuxed on so dialogue never drifts.
    """
    if not shots:
        raise EpisodeAssemblyError("No designated shots for this episode")
    work_dir.mkdir(parents=True, exist_ok=True)
    master_probe = probe_media(master)
    width, height = master_probe.width, master_probe.height
    segments = plan_segments(master_probe.duration_seconds, shots)

    pieces: dict[str, Path] = {}
    for index, batch in enumerate(batch_shots(shots)):
        pieces.update(
            _swap_batch(
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
            )
        )

    timeline: list[Path] = []
    unswapped: list[str] = []
    for index, segment in enumerate(segments):
        if segment.kind == "swap" and segment.clip in pieces:
            timeline.append(pieces[segment.clip])
            continue
        if segment.kind == "swap":
            # Provider refused this shot even alone; keep the original
            # footage rather than failing the whole episode.
            unswapped.append(segment.clip)
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
        "unswapped_clips": unswapped,
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
) -> Path:
    """Swap the first provider batch and deliver the first shot's midpoint frame."""
    if not shots:
        raise EpisodeAssemblyError("No designated shots for the first look")
    first_batch = batch_shots(shots)[0]
    pieces = _swap_batch(
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
    )
    first = first_batch[0]
    return _extract_frame(pieces[first.clip], first.duration / 2, destination)
