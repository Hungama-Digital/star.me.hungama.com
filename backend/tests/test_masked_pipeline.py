"""The masked pipeline's two own failure modes, pinned down.

Neither can happen on the direct path. An unfilled mask leaves a white patch
where the face should be - it reached a delivered episode on 26 August and only
a frame-level look caught it. And Seedance 2.0 takes an explicit duration and
invents footage for any second the input does not cover, which is why inputs
are padded to a whole second before they are sent.
"""

import subprocess
from pathlib import Path

from starme.config import Settings
from starme.episode_assembly import (
    MAX_UNFILLED_MASK_PERCENT,
    _pad_to_whole_second,
    unfilled_mask_percentage,
)
from starme.media_pipeline import probe_media
from starme.prompts import mask_prompt, masked_swap_prompt
from starme.render_pipeline import execute_masked_render, execute_seedance_render, render_fn_for


def _clip(path: Path, seconds: float, colour: str = "black") -> Path:
    subprocess.run(  # noqa: S603
        [  # noqa: S607
            "ffmpeg", "-y", "-v", "error", "-f", "lavfi",
            "-i", f"color=c={colour}:s=320x568:r=24:d={seconds}",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
            str(path),
        ],
        check=True,
        capture_output=True,
    )
    return path


def test_padding_reaches_a_whole_second_without_losing_footage(tmp_path: Path) -> None:
    source = _clip(tmp_path / "in.mp4", 7.64)
    padded = tmp_path / "padded.mp4"
    asked = _pad_to_whole_second(source, padded, 7.64)
    assert asked == 8
    # The provider is asked for 8 seconds and now has 8 seconds of real frames,
    # so it has nothing to invent.
    assert abs(probe_media(padded).duration_seconds - 8.0) < 0.1


def test_padding_never_asks_below_the_provider_minimum(tmp_path: Path) -> None:
    """A 1.3s shot on its own would be refused; it is padded to the floor."""
    source = _clip(tmp_path / "short.mp4", 1.3)
    padded = tmp_path / "short-padded.mp4"
    assert _pad_to_whole_second(source, padded, 1.3) == 4


def test_an_unfilled_mask_is_detected(tmp_path: Path) -> None:
    source = _clip(tmp_path / "src.mp4", 1.0, colour="black")
    leaked = _clip(tmp_path / "leaked.mp4", 1.0, colour="white")
    percentage = unfilled_mask_percentage(leaked, source)
    assert percentage > MAX_UNFILLED_MASK_PERCENT


def test_a_clean_fill_reads_as_clean(tmp_path: Path) -> None:
    source = _clip(tmp_path / "src2.mp4", 1.0, colour="black")
    filled = _clip(tmp_path / "filled.mp4", 1.0, colour="gray")
    assert unfilled_mask_percentage(filled, source) <= MAX_UNFILLED_MASK_PERCENT


def test_bright_source_is_not_mistaken_for_a_leak(tmp_path: Path) -> None:
    """A scene with real white in it must not read as an unfilled mask."""
    source = _clip(tmp_path / "bright.mp4", 1.0, colour="white")
    output = _clip(tmp_path / "bright-out.mp4", 1.0, colour="white")
    assert unfilled_mask_percentage(output, source) <= MAX_UNFILLED_MASK_PERCENT


def test_the_configured_method_picks_the_render_function() -> None:
    assert render_fn_for(Settings(render_method="direct")) is execute_seedance_render
    assert render_fn_for(Settings(render_method="masked")) is execute_masked_render
    # An unrecognised value must not silently start spending twice per batch.
    assert render_fn_for(Settings(render_method="nonsense")) is execute_seedance_render


def test_the_mask_prompt_covers_hair_not_just_the_face() -> None:
    """Replacing hair is the whole reason the masked route exists: a direct
    edit keeps the actor's hairline and so the subscriber's face shape."""
    text = mask_prompt(subject_video_desc="the man in the denim shirt").text
    for phrase in ("all visible hair", "hairline", "the full hairstyle", "solid opaque white"):
        assert phrase in text


def test_the_fill_prompt_asks_for_a_reconstruction() -> None:
    text = masked_swap_prompt(
        subject_video_desc="the man in the denim shirt",
        image_desc="the man with glasses",
        extra_notes="Leave the woman untouched.",
    ).text
    assert "no white area remains" in text
    assert "face, hairline and hairstyle" in text
    assert "Leave the woman untouched." in text
