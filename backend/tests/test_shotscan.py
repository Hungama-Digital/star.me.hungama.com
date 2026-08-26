"""The scanner decides where the lead is, so these tests pin that decision.

Every wrong face shipped so far came from a hand-written list of the lead's
shots. These cover the two ways such a list goes wrong: designating footage he
is absent from (which is what puts his face on the co-star) and skipping
footage he is in (which leaves the original actor on screen).
"""

import subprocess
from pathlib import Path

from starme import shotscan
from starme.shotscan import ScannedShot, designated, manifest_entries, shot_boundaries

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


def _shot(
    matching: int, sampled: int = 8, start: float = 0.0, duration: float = 2.0
) -> ScannedShot:
    return ScannedShot(
        start=start,
        duration=duration,
        frames_sampled=sampled,
        frames_matching_lead=matching,
        best_similarity=0.9 if matching else 0.05,
        largest_face_area=0.02,
    )


def test_one_matching_frame_is_not_enough() -> None:
    """A single match is treated as noise. Designating a shot the lead is not
    in is the failure that sends the co-star's close-up to the provider."""
    assert not _shot(matching=1).has_lead
    assert _shot(matching=2).has_lead


def test_adjacent_shots_merge_into_one_window() -> None:
    shots = [
        _shot(matching=4, start=0.0, duration=2.0),
        _shot(matching=4, start=2.0, duration=1.5),
        _shot(matching=0, start=3.5, duration=1.0),
        _shot(matching=3, start=4.5, duration=2.0),
    ]
    assert designated(shots) == [(0.0, 3.5), (4.5, 2.0)]


def test_shots_without_the_lead_are_excluded() -> None:
    shots = [_shot(matching=0, start=0.0, duration=3.0), _shot(matching=5, start=3.0)]
    assert designated(shots) == [(3.0, 2.0)]


def test_a_small_but_present_face_still_counts(tmp_path: Path) -> None:
    """The aisle shot nobody swapped had the lead at under 0.2% of frame area,
    behind the co-star, and a viewer noticed immediately. The area floor sits
    below that on purpose."""
    clip = tmp_path / "clip.mp4"
    make_clip(clip)
    portrait = tmp_path / "lead.png"
    portrait.write_bytes(b"x")

    def embed(path: Path):
        # The portrait is the lead alone; the frames are a tiny lead face
        # behind a large co-star, exactly the aisle shot's geometry.
        if path.name == "lead.png":
            return [(LEAD, 0.5)]
        return [(LEAD, 0.0015), (COSTAR, 0.09)]

    shots = shotscan.scan(clip, portrait, duration=2.0, embedder=embed)
    assert shots, "the scan produced no shots"
    assert all(s.has_lead for s in shots)


def test_a_costar_only_shot_is_not_designated(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    make_clip(clip)
    portrait = tmp_path / "lead.png"
    portrait.write_bytes(b"x")

    def embed(path: Path):
        if path.name == "lead.png":
            return [(LEAD, 0.5)]
        return [(COSTAR, 0.09)]

    shots = shotscan.scan(clip, portrait, duration=2.0, embedder=embed)
    assert shots
    assert not any(s.has_lead for s in shots)
    assert designated(shots) == []


def test_boundaries_cover_the_whole_clip(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    make_clip(clip, seconds=3.0)
    bounds = shot_boundaries(clip, 3.0)
    assert bounds
    assert bounds[0][0] == 0.0
    assert abs((bounds[-1][0] + bounds[-1][1]) - 3.0) < 0.05


def test_manifest_entries_match_the_pipeline_shape() -> None:
    entries = manifest_entries(
        [_shot(matching=4, start=1.5, duration=2.5)],
        episode=1,
        role_character="Arjun",
        co_stars="Riya",
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
