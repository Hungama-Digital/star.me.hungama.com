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

# All assembled segments are conformed to the master's own resolution so the
# concat step can stream-copy and the structural gate's dimensions check holds.
# Untouched footage keeps native quality; swapped shots are upscaled from the
# provider's 720p tier. All current masters are 24 fps.
_FPS = 24

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


def _cut_segment(
    source: Path, start: float, duration: float, destination: Path, *, width: int, height: int
) -> Path:
    """Silent, conformed video cut; keep and swap inputs share one format."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(start),
            "-i",
            str(source),
            "-t",
            str(duration),
            "-map",
            "0:v:0",
            "-an",
            "-vf",
            f"scale={width}:{height},fps={_FPS}",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(destination),
        ]
    )
    return destination


def _conform_exact(
    source: Path, duration: float, destination: Path, *, width: int, height: int
) -> Path:
    """Conform a provider output to the segment's exact source duration.

    Seedance 2.5 trims a few hundred milliseconds; cloning the final frame and
    then cutting at the exact duration keeps the assembled timeline (and the
    original episode audio) in sync.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(source),
            "-t",
            str(duration),
            "-an",
            "-vf",
            f"scale={width}:{height},fps={_FPS},tpad=stop_mode=clone:stop_duration=5",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(destination),
        ]
    )
    return destination


def _concat(segments: list[Path], destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    listing = destination.with_suffix(".concat.txt")
    listing.write_text("".join(f"file '{path}'\n" for path in segments))
    _run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(listing),
            "-c",
            "copy",
            str(destination),
        ]
    )
    return destination


def _extract_full_audio(master: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(master),
            "-map",
            "0:a:0",
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(destination),
        ]
    )
    return destination


def _extract_frame(video: Path, at_seconds: float, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(at_seconds),
            "-i",
            str(video),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(destination),
        ]
    )
    return destination


def _swap_segment(
    *,
    master: Path,
    segment: Segment,
    work_dir: Path,
    reference: str,
    face_asset_uri: str,
    subject_video_desc: str,
    extra_notes: str,
    settings: Settings,
    render: RenderFn,
    width: int = 720,
    height: int = 1280,
) -> Path:
    """Cut one designated shot, face-swap it, and conform it back to exact length."""
    shot_video = _cut_segment(
        master,
        segment.start,
        segment.duration,
        work_dir / f"{reference}-src.mp4",
        width=width,
        height=height,
    )
    shot_audio = _extract_full_audio_range(master, segment, work_dir / f"{reference}-src.m4a")
    spec = SeedanceRenderSpec(
        reference=reference,
        source_video_url="",
        source_video_path=str(shot_video),
        original_audio_path=str(shot_audio),
        reference_asset_uris=(face_asset_uri,),
        subject_video_desc=subject_video_desc,
        extra_notes=extra_notes,
    )
    result = render(asdict(spec), settings)
    generated = Path(str(result["generated_video_path"]))
    return _conform_exact(
        generated,
        segment.duration,
        work_dir / f"{reference}-conformed.mp4",
        width=width,
        height=height,
    )


def _extract_full_audio_range(master: Path, segment: Segment, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(segment.start),
            "-i",
            str(master),
            "-t",
            str(segment.duration),
            "-map",
            "0:a:0",
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(destination),
        ]
    )
    return destination


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

    Untouched footage is preserved verbatim (re-encoded once into the shared
    segment format), swapped shots are conformed back to their exact source
    duration, and the complete original episode audio is remuxed onto the
    assembled video so dialogue timing never drifts.
    """
    if not shots:
        raise EpisodeAssemblyError("No designated shots for this episode")
    work_dir.mkdir(parents=True, exist_ok=True)
    master_probe = probe_media(master)
    width, height = master_probe.width, master_probe.height
    segments = plan_segments(master_probe.duration_seconds, shots)

    rendered: list[Path] = []
    for index, segment in enumerate(segments):
        name = f"{reference_prefix}-seg{index:02d}"
        if segment.kind == "keep":
            rendered.append(
                _cut_segment(
                    master,
                    segment.start,
                    segment.duration,
                    work_dir / f"{name}.mp4",
                    width=width,
                    height=height,
                )
            )
        else:
            rendered.append(
                _swap_segment(
                    master=master,
                    segment=segment,
                    work_dir=work_dir,
                    reference=name,
                    face_asset_uri=face_asset_uri,
                    subject_video_desc=subject_video_desc,
                    extra_notes=extra_notes,
                    settings=settings,
                    render=render,
                    width=width,
                    height=height,
                )
            )

    silent = _concat(rendered, work_dir / f"{reference_prefix}-assembled-silent.mp4")
    audio = _extract_full_audio(master, work_dir / f"{reference_prefix}-original.m4a")
    final = remux_original_audio(silent, audio, destination)
    report = structural_quality_report(master, final)
    if not report.passed:
        raise EpisodeAssemblyError(f"Assembled episode failed structural gates: {report.checks}")
    return {
        "final_video_path": str(final),
        "segments": len(segments),
        "swapped_segments": sum(1 for segment in segments if segment.kind == "swap"),
        "quality_checks": report.checks,
    }


def render_first_look(
    *,
    master: Path,
    shot: Shot,
    work_dir: Path,
    destination: Path,
    face_asset_uri: str,
    subject_video_desc: str,
    extra_notes: str = "",
    reference: str,
    settings: Settings,
    render: RenderFn = execute_seedance_render,
) -> Path:
    """Swap the first designated shot and deliver its midpoint frame as the first look."""
    segment = Segment("swap", shot.start, shot.end, shot.clip)
    swapped = _swap_segment(
        master=master,
        segment=segment,
        work_dir=work_dir,
        reference=reference,
        face_asset_uri=face_asset_uri,
        subject_video_desc=subject_video_desc,
        extra_notes=extra_notes,
        settings=settings,
        render=render,
    )
    return _extract_frame(swapped, segment.duration / 2, destination)
