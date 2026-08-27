"""The scanner decides where the lead is, so these tests pin that decision.

The cases are the real ones, with the areas and similarities measured off
Episode 1 on 27 August:

  * the co-star's extreme close-up: 50-64% of frame, 0.19 against the lead
  * the lead in a two-shot: 3-5% of frame, 0.40-0.63
  * the bus aisle: every face 0.15-0.77%, similarities 0.05-0.36 - noise

Shot-level designation failed both ends of this: it sent the co-star's close-up
because it shared an undetected cut with a two-shot, and it skipped the aisle
because nothing there scores above the match threshold.
"""

import subprocess
from pathlib import Path

from starme import shotscan
from starme.shotscan import (
    FrameVerdict,
    Window,
    manifest_entries,
    windows,
)

LEAD = [1.0, 0.0, 0.0]
COSTAR = [0.0, 1.0, 0.0]


def make_clip(path: Path, seconds: float = 2.0) -> None:
    subprocess.run(  # noqa: S603
        [  # noqa: S607
            "ffmpeg", "-y", "-v", "error", "-f", "lavfi",
            "-i", f"testsrc=size=320x568:rate=24:duration={seconds}",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def _verdicts(pattern: str, interval: float = 0.25) -> list[FrameVerdict]:
    """Build a frame sequence from a string: '#' designated, '.' not."""
    return [
        FrameVerdict(round(i * interval, 3), ch == "#", "", 0.0, 0.0)
        for i, ch in enumerate(pattern)
    ]


def test_a_large_face_that_is_not_the_lead_is_excluded(tmp_path: Path) -> None:
    """The co-star's close-up: big enough to identify, and not him. This is
    the frame that came back wearing a subscriber's face."""
    clip = tmp_path / "clip.mp4"
    make_clip(clip)
    portrait = tmp_path / "lead.png"
    portrait.write_bytes(b"x")

    def embed(path: Path):
        if path.name == "lead.png":
            return [(LEAD, 0.5)]
        return [(COSTAR, 0.55)]

    verdicts = shotscan.judge_frames(clip, portrait, embedder=embed)
    assert verdicts
    assert not any(v.designated for v in verdicts)
    assert all(v.reason == "identified, not the lead" for v in verdicts)


def test_a_face_too_small_to_identify_is_kept(tmp_path: Path) -> None:
    """The bus aisle. Nothing there can be identified, so nothing there can be
    ruled out - and leaving it produced a visibly unswapped face."""
    clip = tmp_path / "clip.mp4"
    make_clip(clip)
    portrait = tmp_path / "lead.png"
    portrait.write_bytes(b"x")

    def embed(path: Path):
        if path.name == "lead.png":
            return [(LEAD, 0.5)]
        return [(COSTAR, 0.004), (COSTAR, 0.006)]

    verdicts = shotscan.judge_frames(clip, portrait, embedder=embed)
    assert all(v.designated for v in verdicts)
    assert all(v.reason == "face too small to rule out" for v in verdicts)


def test_the_lead_is_matched_when_his_face_is_judgeable(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    make_clip(clip)
    portrait = tmp_path / "lead.png"
    portrait.write_bytes(b"x")

    def embed(path: Path):
        if path.name == "lead.png":
            return [(LEAD, 0.5)]
        return [(LEAD, 0.04), (COSTAR, 0.03)]

    verdicts = shotscan.judge_frames(clip, portrait, embedder=embed)
    assert all(v.designated for v in verdicts)
    assert all(v.reason == "lead matched" for v in verdicts)


def test_an_empty_frame_is_not_designated(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    make_clip(clip)
    portrait = tmp_path / "lead.png"
    portrait.write_bytes(b"x")

    def embed(path: Path):
        return [(LEAD, 0.5)] if path.name == "lead.png" else []

    verdicts = shotscan.judge_frames(clip, portrait, embedder=embed)
    assert not any(v.designated for v in verdicts)


def test_a_mixed_shot_splits_at_the_frames(tmp_path: Path) -> None:
    """The 51.5-54s case: the lead, then her close-up, then the lead again,
    with no cut the scene detector can see. Shot-level designation sent the
    whole thing; frame-level keeps her out of it."""
    found = windows(_verdicts("####........####"), interval=0.25)
    assert found == [Window(0.0, 1.0), Window(3.0, 1.0)]


def test_one_stray_frame_does_not_become_a_provider_call() -> None:
    assert windows(_verdicts("..#....."), interval=0.25) == []


def test_a_short_gap_is_bridged_rather_than_split() -> None:
    """Two calls and a timeline seam are not worth saving a quarter second."""
    assert windows(_verdicts("####.####"), interval=0.25) == [Window(0.0, 2.25)]


def test_window_edges_snap_onto_real_cuts() -> None:
    found = windows(_verdicts("..####.."), interval=0.25, cuts=[0.4, 1.6])
    assert found == [Window(0.4, 1.2)]


def test_manifest_entries_match_the_pipeline_shape() -> None:
    entries = manifest_entries(
        [Window(1.5, 2.5)], episode=1, role_character="Arjun", co_stars="Riya"
    )
    assert entries == [
        {
            "episode": 1,
            "clip": "ep01_arjun_auto_01",
            "start": 1.5,
            "duration": 2.5,
            "characters": "Arjun, Riya",
        }
    ]
