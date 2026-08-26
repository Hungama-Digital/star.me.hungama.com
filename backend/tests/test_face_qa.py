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


# Identity vectors for the master-aware tests. Orthogonal so cosine
# similarity is unambiguous: 1.0 against itself, 0.0 against the others.
SUBSCRIBER = [1.0, 0.0, 0.0]
LEAD = [0.0, 1.0, 0.0]
COSTAR = [0.0, 0.0, 1.0]


def _pair(master_faces, output_faces):
    """One embedder serving both videos, keyed on which file it is asked for."""

    def embed(path: Path):
        return master_faces if path.parent.name == "src" else output_faces

    return embed


def test_costar_replaced_in_her_own_shot_fails(tmp_path: Path) -> None:
    """The 25 August failure: a shot containing only the co-star came back
    wearing the subscriber's face. Subscriber-only QA scores this a clean
    pass, because the face on screen does match the subscriber."""
    output, master = tmp_path / "clip.mp4", tmp_path / "master.mp4"
    make_clip(output)
    make_clip(master)

    blind = judge_window(output, SUBSCRIBER, embedder=lambda p: [(SUBSCRIBER, 0.4)])
    assert blind.passed, "subscriber-only QA cannot see this failure"

    verdict = judge_window(
        output,
        SUBSCRIBER,
        master=master,
        lead_reference=LEAD,
        embedder=_pair([(COSTAR, 0.4)], [(SUBSCRIBER, 0.4)]),
    )
    assert not verdict.passed
    assert verdict.orphan_swap_frames >= 2
    assert verdict.altered_bystander_frames >= 2


def test_costar_beside_the_lead_must_survive(tmp_path: Path) -> None:
    """Both people in a two-shot came back as the subscriber."""
    output, master = tmp_path / "clip.mp4", tmp_path / "master.mp4"
    make_clip(output)
    make_clip(master)
    verdict = judge_window(
        output,
        SUBSCRIBER,
        master=master,
        lead_reference=LEAD,
        embedder=_pair([(LEAD, 0.3), (COSTAR, 0.3)], [(SUBSCRIBER, 0.3), (SUBSCRIBER, 0.3)]),
    )
    assert not verdict.passed
    assert verdict.altered_bystander_frames >= 2


def test_correct_swap_beside_an_untouched_costar_passes(tmp_path: Path) -> None:
    """The lead becomes the subscriber, the co-star stays herself."""
    output, master = tmp_path / "clip.mp4", tmp_path / "master.mp4"
    make_clip(output)
    make_clip(master)
    verdict = judge_window(
        output,
        SUBSCRIBER,
        master=master,
        lead_reference=LEAD,
        embedder=_pair([(LEAD, 0.3), (COSTAR, 0.3)], [(SUBSCRIBER, 0.3), (COSTAR, 0.3)]),
    )
    assert verdict.passed
    assert verdict.altered_bystander_frames == 0
    assert verdict.orphan_swap_frames == 0
