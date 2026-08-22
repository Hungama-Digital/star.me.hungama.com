from pathlib import Path

from starme.face_qa import WindowVerdict, judge_window


def make_clip(path: Path, seconds: int = 2) -> None:
    import subprocess

    subprocess.run(  # noqa: S603
        [  # noqa: S607
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"testsrc=size=320x568:rate=24:duration={seconds}",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def test_matching_faces_pass(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    make_clip(clip)
    verdict = judge_window(clip, [1.0, 0.0], embedder=lambda p: [([1.0, 0.0], 0.4)])
    assert verdict.passed
    assert verdict.judged_frames > 0
    assert verdict.min_target_similarity is not None
    assert verdict.min_target_similarity > 0.9


def test_wrong_identity_fails(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    make_clip(clip)
    verdict = judge_window(clip, [1.0, 0.0], embedder=lambda p: [([-1.0, 0.0], 0.4)])
    assert not verdict.passed
    assert verdict.wrong_identity_frames >= 2


def test_double_swap_fails(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    make_clip(clip)
    two_matches = [([1.0, 0.0], 0.3), ([0.9, 0.1], 0.2)]
    verdict = judge_window(clip, [1.0, 0.0], embedder=lambda p: two_matches)
    assert not verdict.passed
    assert verdict.double_match_frames >= 2


def test_faceless_frames_are_ignored(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    make_clip(clip)
    verdict = judge_window(clip, [1.0, 0.0], embedder=lambda p: [])
    assert verdict.passed
    assert verdict.judged_frames == 0
    assert isinstance(verdict, WindowVerdict)
