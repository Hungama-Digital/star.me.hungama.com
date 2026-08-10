import shutil
import subprocess
from pathlib import Path

import pytest

from starme.media_pipeline import (
    extract_shot,
    probe_media,
    remux_original_audio,
    structural_quality_report,
)


def make_fixture(path: Path, *, landscape: bool = False) -> None:
    size = "320x180" if landscape else "180x320"
    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg is not None
    subprocess.run(  # noqa: S603 - resolved installed test fixture executable
        [
            ffmpeg,
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"testsrc2=size={size}:rate=24:duration=4",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=4",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def test_extract_remux_and_quality_gate(tmp_path: Path) -> None:
    source = tmp_path / "source.mp4"
    make_fixture(source)
    shot = tmp_path / "shot.mp4"
    audio = tmp_path / "audio.m4a"

    extract_shot(
        source,
        start_seconds=1,
        duration_seconds=2,
        video_destination=shot,
        audio_destination=audio,
    )
    assert probe_media(shot).has_audio is False
    final = remux_original_audio(shot, audio, tmp_path / "final.mp4")
    report = structural_quality_report(source=shot, output=final)

    assert report.passed
    assert report.output.has_audio
    assert report.output.height > report.output.width


def test_quality_gate_rejects_landscape_output(tmp_path: Path) -> None:
    source = tmp_path / "source.mp4"
    output = tmp_path / "output.mp4"
    make_fixture(source)
    make_fixture(output, landscape=True)

    report = structural_quality_report(source, output)

    assert not report.passed
    assert not report.checks["dimensions_preserved"]
    assert not report.checks["portrait_orientation"]


@pytest.mark.parametrize("duration", [1.9, 15.1])
def test_extract_rejects_unsupported_shot_duration(tmp_path: Path, duration: float) -> None:
    with pytest.raises(ValueError, match="between 2 and 15 seconds"):
        extract_shot(
            tmp_path / "missing.mp4",
            start_seconds=0,
            duration_seconds=duration,
            video_destination=tmp_path / "shot.mp4",
            audio_destination=tmp_path / "audio.m4a",
        )
