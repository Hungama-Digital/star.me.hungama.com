from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class MediaPipelineError(RuntimeError):
    pass


@dataclass(frozen=True)
class MediaProbe:
    duration_seconds: float
    width: int
    height: int
    video_codec: str
    has_audio: bool


@dataclass(frozen=True)
class QualityReport:
    passed: bool
    checks: dict[str, bool]
    source: MediaProbe
    output: MediaProbe


@dataclass(frozen=True)
class RecastPreflight:
    target_role: str
    detectable_face_roles: tuple[str, ...]
    target_cast_category: str
    replacement_cast_category: str
    provider_supports_target_selection: bool = False


def validate_recast_preflight(preflight: RecastPreflight) -> None:
    """Fail closed before a provider that may auto-select the nearest face.

    Role and cast-category values must come from content-owner/operator metadata;
    this function deliberately does not infer gender or identity from pixels.
    """
    target = preflight.target_role.strip().casefold()
    faces = tuple(
        role.strip().casefold() for role in preflight.detectable_face_roles if role.strip()
    )
    if not target or target not in faces:
        raise MediaPipelineError("The designated target face is not detectable throughout the shot")
    if len(faces) != 1 and not preflight.provider_supports_target_selection:
        raise MediaPipelineError(
            "Multiple face tracks are detectable and the provider has no explicit target selector"
        )
    target_category = preflight.target_cast_category.strip().casefold()
    replacement_category = preflight.replacement_cast_category.strip().casefold()
    if not target_category or not replacement_category:
        raise MediaPipelineError("Approved target and replacement cast categories are required")
    if target_category != replacement_category:
        raise MediaPipelineError("Replacement cast category does not match the designated role")


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, check=True, capture_output=True, text=True)  # noqa: S603
    except FileNotFoundError as exc:
        raise MediaPipelineError(f"Required executable is unavailable: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip().splitlines()[-1] if exc.stderr.strip() else "unknown error"
        raise MediaPipelineError(f"{command[0]} failed: {detail}") from exc


def probe_media(path: Path) -> MediaProbe:
    if not path.is_file():
        raise MediaPipelineError(f"Media file does not exist: {path}")
    result = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,codec_name,width,height",
            "-of",
            "json",
            str(path),
        ]
    )
    data: dict[str, Any] = json.loads(result.stdout)
    streams = data.get("streams", [])
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    if video is None:
        raise MediaPipelineError(f"No video stream found: {path}")
    return MediaProbe(
        duration_seconds=float(data["format"]["duration"]),
        width=int(video.get("width", 0)),
        height=int(video.get("height", 0)),
        video_codec=str(video.get("codec_name", "unknown")),
        has_audio=any(item.get("codec_type") == "audio" for item in streams),
    )


def extract_shot(
    source: Path,
    *,
    start_seconds: float,
    duration_seconds: float,
    video_destination: Path,
    audio_destination: Path,
) -> tuple[Path, Path]:
    if start_seconds < 0 or not 2 <= duration_seconds <= 15:
        raise ValueError("Shot must start at or after zero and be between 2 and 15 seconds")
    video_destination.parent.mkdir(parents=True, exist_ok=True)
    audio_destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(start_seconds),
            "-i",
            str(source),
            "-t",
            str(duration_seconds),
            "-map",
            "0:v:0",
            "-an",
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
            str(video_destination),
        ]
    )
    _run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(start_seconds),
            "-i",
            str(source),
            "-t",
            str(duration_seconds),
            "-map",
            "0:a:0",
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(audio_destination),
        ]
    )
    return video_destination, audio_destination


def remux_original_audio(generated_video: Path, original_audio: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(generated_video),
            "-i",
            str(original_audio),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            "-movflags",
            "+faststart",
            str(destination),
        ]
    )
    return destination


def structural_quality_report(
    source: Path,
    output: Path,
    *,
    duration_tolerance_seconds: float = 0.75,
) -> QualityReport:
    source_probe = probe_media(source)
    output_probe = probe_media(output)
    checks = {
        "duration_preserved": (
            abs(source_probe.duration_seconds - output_probe.duration_seconds)
            <= duration_tolerance_seconds
        ),
        "dimensions_preserved": (
            source_probe.width == output_probe.width and source_probe.height == output_probe.height
        ),
        "portrait_orientation": output_probe.height > output_probe.width,
        "supported_video_codec": output_probe.video_codec in {"h264", "hevc", "av1"},
        "audio_present": output_probe.has_audio,
    }
    return QualityReport(
        passed=all(checks.values()), checks=checks, source=source_probe, output=output_probe
    )
