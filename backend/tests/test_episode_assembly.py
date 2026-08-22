import json
import subprocess
from pathlib import Path

import pytest

from starme.config import Settings
from starme.episode_assembly import (
    EpisodeAssemblyError,
    Shot,
    assemble_episode,
    batch_shots,
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
    with pytest.raises(EpisodeAssemblyError, match="past the episode"):
        plan_segments(5.0, [shot(1, "a", 2, 6)])


def test_batching_targets_the_drift_safe_window() -> None:
    # The real Episode 1 coverage durations. Batches stay at or under 8s (the
    # size that held identity in the 20-22 August reviews), like the verified
    # merged clip (2s+6s).
    durations = [2, 6, 4, 5, 5, 4, 4]
    shots = [shot(1, f"c{i}", sum(durations[:i]) * 2 + 7, d) for i, d in enumerate(durations)]
    batches = batch_shots(shots)
    assert [[s.clip for s in batch] for batch in batches] == [
        ["c0", "c1"],
        ["c2"],
        ["c3"],
        ["c4"],
        ["c5", "c6"],
    ]
    assert all(4 <= sum(s.duration for s in batch) <= 8 for batch in batches)


def test_batching_repairs_a_short_final_batch() -> None:
    # 14s + 2s: the trailing 2s shot cannot stand alone, so it borrows the
    # previous batch's last shot.
    shots = [shot(1, "a", 0, 7), shot(1, "b", 10, 7), shot(1, "c", 20, 2)]
    batches = batch_shots(shots)
    assert [[s.clip for s in batch] for batch in batches] == [["a"], ["b", "c"]]
    with pytest.raises(EpisodeAssemblyError, match="at least 4"):
        batch_shots([shot(1, "only", 0, 2)])
    with pytest.raises(EpisodeAssemblyError, match="at most 15"):
        batch_shots([shot(1, "long", 0, 16)])


def _make_master(path: Path, seconds: int) -> None:
    subprocess.run(  # noqa: S603
        [  # noqa: S607 - test fixture generation, same ffmpeg the module itself invokes
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"testsrc=size=1080x1920:rate=24:duration={seconds}",
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
    """Identity 'swap' that re-encodes with DIFFERENT parameters.

    Real provider outputs never share our encoder settings; the 21 August
    corruption escaped because the old fake returned byte-identical encodes.
    """
    source = Path(str(spec_data["source_video_path"]))
    generated = source.with_name(source.name.replace(".mp4", "-generated.mp4"))
    subprocess.run(  # noqa: S603
        [  # noqa: S607
            "ffmpeg",
            "-y",
            "-i",
            str(source),
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "30",
            "-profile:v",
            "baseline",
            "-pix_fmt",
            "yuv420p",
            str(generated),
        ],
        check=True,
        capture_output=True,
    )
    return {"generated_video_path": str(generated)}


def test_assemble_episode_rebuilds_full_length_with_audio(tmp_path: Path) -> None:
    master = tmp_path / "episode-1.mp4"
    _make_master(master, 12)
    # A 2s shot and a 3s shot: batched together into one 5s provider call.
    result = assemble_episode(
        master=master,
        shots=[shot(1, "s1", 2, 2), shot(1, "s2", 6, 3)],
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
    assert result["segments"] == 5
    assert result["swapped_segments"] == 2
    assert result["provider_batches"] == 1
    assert result["quality_checks"] == {
        "duration_preserved": True,
        "dimensions_preserved": True,
        "portrait_orientation": True,
        "supported_video_codec": True,
        "audio_present": True,
    }
    probe = probe_media(final)
    assert abs(probe.duration_seconds - 12.0) <= 0.75
    # Masters are 1080x1920; provider batches run at 720p and upscale back.
    assert (probe.width, probe.height) == (1080, 1920)
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
    _make_master(master, 12)
    frame = render_first_look(
        master=master,
        shots=[shot(1, "s1", 2, 2), shot(1, "s2", 6, 3)],
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


def accept_all_embedder(image_path: Path) -> list[tuple[list[float], float]]:
    """Every face is the reference face (embedding [1,0], full-frame)."""
    return [([1.0, 0.0], 0.5)]


def test_assembly_face_qa_rerolls_until_pass(tmp_path: Path) -> None:
    from starme.episode_assembly import _swap_batch_verified

    master = tmp_path / "episode-1.mp4"
    _make_master(master, 12)
    rolls: list[int] = []

    def flaky_render(spec_data: dict[str, object], settings: Settings) -> dict[str, object]:
        rolls.append(1)
        return fake_render(spec_data, settings)

    calls = {"n": 0}

    def flaky_embedder(image_path: Path) -> list[tuple[list[float], float]]:
        # First roll's frames read as the WRONG identity; later rolls pass.
        calls["n"] += 1
        if len(rolls) < 2:
            return [([-1.0, 0.0], 0.5)]
        return [([1.0, 0.0], 0.5)]

    pieces, report = _swap_batch_verified(
        master=master,
        batch=[shot(1, "s1", 2, 2), shot(1, "s2", 6, 3)],
        work_dir=tmp_path / "work",
        reference="order-x-batch00",
        face_asset_uri="asset://face-1",
        subject_video_desc="the designated lead",
        extra_notes="",
        settings=Settings(environment="test"),
        render=flaky_render,
        piece_width=720,
        piece_height=1280,
        reference_face=[1.0, 0.0],
        embedder=flaky_embedder,
        max_rolls=3,
    )
    assert len(rolls) == 2
    assert report["rolls_used"] == 2
    assert set(pieces) == {"s1", "s2"}
    # Cached: a rerun does not re-render.
    pieces2, _ = _swap_batch_verified(
        master=master,
        batch=[shot(1, "s1", 2, 2), shot(1, "s2", 6, 3)],
        work_dir=tmp_path / "work",
        reference="order-x-batch00",
        face_asset_uri="asset://face-1",
        subject_video_desc="the designated lead",
        extra_notes="",
        settings=Settings(environment="test"),
        render=flaky_render,
        piece_width=720,
        piece_height=1280,
        reference_face=[1.0, 0.0],
        embedder=flaky_embedder,
        max_rolls=3,
    )
    assert len(rolls) == 2
    assert pieces2 == pieces


def test_assembly_fails_closed_when_qa_never_passes(tmp_path: Path) -> None:
    from starme.episode_assembly import _swap_batch_verified

    master = tmp_path / "episode-1.mp4"
    _make_master(master, 12)

    def wrong_face_embedder(image_path: Path) -> list[tuple[list[float], float]]:
        return [([-1.0, 0.0], 0.5)]

    with pytest.raises(EpisodeAssemblyError, match="failed face QA after 2 rolls"):
        _swap_batch_verified(
            master=master,
            batch=[shot(1, "s1", 2, 2), shot(1, "s2", 6, 3)],
            work_dir=tmp_path / "work2",
            reference="order-y-batch00",
            face_asset_uri="asset://face-1",
            subject_video_desc="the designated lead",
            extra_notes="",
            settings=Settings(environment="test"),
            render=fake_render,
            piece_width=720,
            piece_height=1280,
            reference_face=[1.0, 0.0],
            embedder=wrong_face_embedder,
            max_rolls=2,
        )


def test_batching_repairs_a_short_first_batch() -> None:
    # A 2s opener followed by a 9s shot: the opener cannot stand alone and the
    # pair exceeds the target, so the repair merges them within the hard cap.
    shots = [shot(1, "a", 7, 2), shot(1, "b", 11, 9)]
    batches = batch_shots(shots)
    assert [[s.clip for s in batch] for batch in batches] == [["a", "b"]]
    assert sum(s.duration for s in batches[0]) == 11
