import json
import shutil
import subprocess
from pathlib import Path

import pytest

from starme.config import Settings
from starme.episode_assembly import (
    EpisodeAssemblyError,
    Shot,
    assemble_episode,
    load_shot_manifest,
    plan_segments,
    render_first_look,
    shots_for_episode,
)
from starme.media_pipeline import probe_media


def shot(episode: int, clip: str, start: float, duration: float, chars: str = "Arjun") -> Shot:
    return Shot(episode, clip, start, duration, tuple(chars.split(",")))


def test_manifest_parsing_matches_content_owner_format(tmp_path: Path) -> None:
    manifest = tmp_path / "shot-manifest.json"
    manifest.write_text(
        json.dumps(
            [
                {
                    "episode": 1,
                    "clip": "ep01_arjun_02",
                    "start": 11,
                    "duration": 6,
                    "characters": "Arjun, Riya",
                }
            ]
        )
    )
    shots = load_shot_manifest(manifest)
    assert shots == [Shot(1, "ep01_arjun_02", 11.0, 6.0, ("Arjun", "Riya"))]


def test_shots_for_episode_filters_sorts_and_rejects_overlap() -> None:
    shots = [
        shot(2, "b", 5, 3),
        shot(1, "late", 10, 2),
        shot(1, "early", 2, 4, "Arjun, Riya"),
        shot(1, "riya-only", 7, 2, "Riya"),
    ]
    selected = shots_for_episode(shots, 1, "arjun")
    assert [item.clip for item in selected] == ["early", "late"]
    with pytest.raises(EpisodeAssemblyError, match="overlap"):
        shots_for_episode([shot(1, "a", 0, 5), shot(1, "b", 4, 3)], 1, "Arjun")


def test_plan_segments_covers_the_episode_exactly_once() -> None:
    segments = plan_segments(20.0, [shot(1, "a", 2, 4), shot(1, "b", 10, 5)])
    assert [(s.kind, s.start, s.end) for s in segments] == [
        ("keep", 0.0, 2.0),
        ("swap", 2.0, 6.0),
        ("keep", 6.0, 10.0),
        ("swap", 10.0, 15.0),
        ("keep", 15.0, 20.0),
    ]
    # A shot at the very start produces no leading keep segment.
    assert plan_segments(6.0, [shot(1, "a", 0, 6)]) == plan_segments(6.0, [shot(1, "a", 0, 6)])
    assert plan_segments(6.0, [shot(1, "a", 0, 6)])[0].kind == "swap"
    with pytest.raises(EpisodeAssemblyError, match="past the episode"):
        plan_segments(5.0, [shot(1, "a", 2, 6)])


def _make_master(path: Path, seconds: int) -> None:
    subprocess.run(  # noqa: S603
        [  # noqa: S607 - test fixture generation, same ffmpeg the module itself invokes
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"testsrc=size=720x1280:rate=24:duration={seconds}",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=440:duration={seconds}",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
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


def fake_render(spec_data: dict[str, object], settings: Settings) -> dict[str, object]:
    """Identity 'swap': the provider returns the source shot unchanged."""
    source = Path(str(spec_data["source_video_path"]))
    generated = source.with_name(source.name.replace("-src", "-generated"))
    shutil.copyfile(source, generated)
    return {"generated_video_path": str(generated)}


def test_assemble_episode_rebuilds_full_length_with_audio(tmp_path: Path) -> None:
    master = tmp_path / "episode-1.mp4"
    _make_master(master, 8)
    result = assemble_episode(
        master=master,
        shots=[shot(1, "mid", 2, 3)],
        work_dir=tmp_path / "work",
        destination=tmp_path / "final" / "episode-1.mp4",
        face_asset_uri="asset://face-1",
        subject_video_desc="the designated lead",
        reference_prefix="order-1-ep1",
        settings=Settings(environment="test"),
        render=fake_render,
    )
    final = Path(str(result["final_video_path"]))
    assert final.is_file()
    assert result["segments"] == 3
    assert result["swapped_segments"] == 1
    assert result["quality_checks"] == {
        "duration_preserved": True,
        "dimensions_preserved": True,
        "portrait_orientation": True,
        "supported_video_codec": True,
        "audio_present": True,
    }
    probe = probe_media(final)
    assert abs(probe.duration_seconds - 8.0) <= 0.75
    assert (probe.width, probe.height) == (720, 1280)
    assert probe.has_audio


def test_assemble_episode_requires_designated_shots(tmp_path: Path) -> None:
    with pytest.raises(EpisodeAssemblyError, match="No designated shots"):
        assemble_episode(
            master=tmp_path / "missing.mp4",
            shots=[],
            work_dir=tmp_path / "work",
            destination=tmp_path / "final.mp4",
            face_asset_uri="asset://face-1",
            subject_video_desc="the designated lead",
            reference_prefix="x",
            settings=Settings(environment="test"),
            render=fake_render,
        )


def test_render_first_look_produces_a_frame(tmp_path: Path) -> None:
    master = tmp_path / "episode-1.mp4"
    _make_master(master, 8)
    frame = render_first_look(
        master=master,
        shot=shot(1, "mid", 2, 3),
        work_dir=tmp_path / "work",
        destination=tmp_path / "first_look.jpg",
        face_asset_uri="asset://face-1",
        subject_video_desc="the designated lead",
        reference="order-1-first-look",
        settings=Settings(environment="test"),
        render=fake_render,
    )
    assert frame.is_file()
    assert frame.stat().st_size > 1000


def test_short_shots_widen_to_the_provider_minimum() -> None:
    from starme.episode_assembly import widen_swap_windows

    # The real Episode 1 opener: a 2s shot must become a 4s window.
    windows = widen_swap_windows(74.0, [shot(1, "ep01_arjun_01", 7, 2)])
    assert [(w.start, w.end) for w in windows] == [(7.0, 11.0)]
    # At the episode tail the window extends backwards instead.
    tail = widen_swap_windows(10.0, [shot(1, "tail", 8, 2)])
    assert [(w.start, w.end) for w in tail] == [(6.0, 10.0)]
    # Windows that grow into each other merge into one provider call:
    # a widens to [2,6), b widens to [5,9), so the merged window is [2,9).
    merged = widen_swap_windows(20.0, [shot(1, "a", 2, 2), shot(1, "b", 5, 2)])
    assert [(w.start, w.end, w.clip) for w in merged] == [(2.0, 9.0, "a+b")]


def test_plan_segments_uses_widened_windows() -> None:
    segments = plan_segments(20.0, [shot(1, "short", 2, 2)])
    assert [(s.kind, s.start, s.end) for s in segments] == [
        ("keep", 0.0, 2.0),
        ("swap", 2.0, 6.0),
        ("keep", 6.0, 20.0),
    ]


def test_oversized_window_fails_closed() -> None:
    from starme.episode_assembly import EpisodeAssemblyError, widen_swap_windows

    with pytest.raises(EpisodeAssemblyError, match="at most 30"):
        widen_swap_windows(60.0, [shot(1, "long", 2, 31)])
