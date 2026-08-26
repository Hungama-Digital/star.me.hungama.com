from __future__ import annotations

import subprocess
import tempfile
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

# Face-identity QA for swapped windows.
#
# This automates the manual review that shipped Episode 1: sample frames from
# a swapped window, find the faces, and compare each against the subscriber's
# reference portrait. A window passes only when the designated face matches
# the reference wherever it is clearly visible, and nobody else does (the
# double-swap failure class). Embeddings come from insightface (CPU ONNX);
# the embedder is injectable so tests run without models.

EmbedFn = Callable[[Path], list[tuple[list[float], float]]]
"""Returns (embedding, face_area_fraction) per face found in an image."""

# Cosine-similarity working points for insightface buffalo embeddings,
# calibrated loosely: same person typically >0.45, different person <0.2.
PASS_SIMILARITY = 0.35
FAIL_SIMILARITY = 0.18
# Faces smaller than this fraction of the frame are too small to judge.
MIN_FACE_AREA = 0.02


@dataclass
class WindowVerdict:
    passed: bool
    frames_checked: int = 0
    judged_frames: int = 0
    min_target_similarity: float | None = None
    wrong_identity_frames: int = 0
    double_match_frames: int = 0
    #: Frames where somebody who is NOT the lead stopped looking like
    #: themselves. Needs the master to detect, because the subscriber's own
    #: face on a co-star matches the reference perfectly and scores clean.
    altered_bystander_frames: int = 0
    #: Frames whose master shows no lead at all, yet the output carries the
    #: subscriber's face - the manifest sent footage the lead is not in.
    orphan_swap_frames: int = 0
    notes: list[str] = field(default_factory=list)


_default_embedder: EmbedFn | None = None


def _insightface_embedder() -> EmbedFn:
    """Lazy singleton around insightface; imported only when QA is enabled."""
    global _default_embedder
    if _default_embedder is not None:
        return _default_embedder
    import os

    import cv2  # type: ignore[import-not-found]
    from insightface.app import (  # type: ignore[import-not-found]
        FaceAnalysis,
    )

    analyzer = FaceAnalysis(
        name="buffalo_s",
        root=os.environ.get("INSIGHTFACE_HOME", "~/.insightface"),
        providers=["CPUExecutionProvider"],
    )
    analyzer.prepare(ctx_id=-1, det_size=(640, 640))

    def embed(image_path: Path) -> list[tuple[list[float], float]]:
        image = cv2.imread(str(image_path))
        if image is None:
            return []
        height, width = image.shape[:2]
        results = []
        for face in analyzer.get(image):
            x1, y1, x2, y2 = face.bbox
            area = max(0.0, (x2 - x1) * (y2 - y1)) / float(height * width)
            results.append((face.normed_embedding.tolist(), area))
        return results

    _default_embedder = embed
    return embed


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def reference_embedding(portrait: Path, embedder: EmbedFn | None = None) -> list[float]:
    embedder = embedder or _insightface_embedder()
    faces = embedder(portrait)
    if not faces:
        raise ValueError(f"No face found in reference portrait {portrait}")
    return max(faces, key=lambda item: item[1])[0]


def _sample_frames(video: Path, out_dir: Path, interval: float) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(  # noqa: S603
        [  # noqa: S607 - ffmpeg is this package's standing media dependency
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(video),
            "-vf",
            f"fps=1/{interval}",
            str(out_dir / "qa%04d.jpg"),
        ],
        check=True,
        capture_output=True,
    )
    return sorted(out_dir.glob("qa*.jpg"))


def judge_window(
    video: Path,
    reference: list[float],
    *,
    master: Path | None = None,
    lead_reference: list[float] | None = None,
    interval: float = 0.5,
    embedder: EmbedFn | None = None,
) -> WindowVerdict:
    """Judge one swapped window, against the subscriber and against the master.

    Two questions, and the second is the one that matters. Comparing only with
    the subscriber's portrait asks "is the subscriber's face here?", which a
    co-star wrongly wearing that face answers perfectly - on 25 August a
    Riya-only close-up was replaced end to end and would have scored a clean
    pass. Given the master and a still of the ORIGINAL lead, this also asks
    "is everybody else still themselves?", which is the question that catches
    a mis-designated window.

    Frames without a judgeable face (backs, wides, scenery) are ignored. A
    window fails when clearly visible faces repeatedly fail to match the
    reference (wrong identity or unswapped), when two faces in one frame both
    match it (the double-swap class), when a non-lead person stops looking
    like themselves, or when a frame containing no lead comes back carrying
    the subscriber's face.
    """
    embedder = embedder or _insightface_embedder()
    verdict = WindowVerdict(passed=True)
    compare_master = master is not None and lead_reference is not None
    with tempfile.TemporaryDirectory() as scratch:
        frames = _sample_frames(video, Path(scratch) / "out", interval)
        master_frames: list[Path] = []
        if compare_master:
            master_frames = _sample_frames(master, Path(scratch) / "src", interval)  # type: ignore[arg-type]
        verdict.frames_checked = len(frames)
        for index, frame in enumerate(frames):
            faces = [(emb, area) for emb, area in embedder(frame) if area >= MIN_FACE_AREA]
            if not faces:
                continue
            verdict.judged_frames += 1
            embeddings = [emb for emb, _ in faces]
            similarities = sorted((_cosine(reference, emb) for emb in embeddings), reverse=True)
            best = similarities[0]
            if verdict.min_target_similarity is None or best < verdict.min_target_similarity:
                verdict.min_target_similarity = best
            if best < FAIL_SIMILARITY:
                verdict.wrong_identity_frames += 1
            if len(similarities) > 1 and similarities[1] >= PASS_SIMILARITY:
                verdict.double_match_frames += 1

            if not compare_master or index >= len(master_frames):
                continue
            source = [
                emb
                for emb, area in embedder(master_frames[index])
                if area >= MIN_FACE_AREA
            ]
            if not source:
                continue
            lead_present = any(
                _cosine(lead_reference, emb) >= PASS_SIMILARITY for emb in source  # type: ignore[arg-type]
            )
            carries_subscriber = any(
                _cosine(reference, emb) >= PASS_SIMILARITY for emb in embeddings
            )
            if not lead_present and carries_subscriber:
                verdict.orphan_swap_frames += 1
            for original in source:
                if _cosine(lead_reference, original) >= PASS_SIMILARITY:  # type: ignore[arg-type]
                    continue  # the lead is meant to change
                if not any(_cosine(original, emb) >= PASS_SIMILARITY for emb in embeddings):
                    verdict.altered_bystander_frames += 1
                    break

    if verdict.wrong_identity_frames >= 2:
        verdict.passed = False
        verdict.notes.append(
            f"{verdict.wrong_identity_frames} frames show a clearly visible face "
            "that does not match the subscriber reference"
        )
    if verdict.double_match_frames >= 2:
        verdict.passed = False
        verdict.notes.append(
            f"{verdict.double_match_frames} frames show a second face matching the "
            "reference (non-target person was replaced)"
        )
    if verdict.altered_bystander_frames >= 2:
        verdict.passed = False
        verdict.notes.append(
            f"{verdict.altered_bystander_frames} frames show someone other than the "
            "lead no longer matching the master (a co-star was altered)"
        )
    if verdict.orphan_swap_frames >= 2:
        verdict.passed = False
        verdict.notes.append(
            f"{verdict.orphan_swap_frames} frames carry the subscriber's face although "
            "the master has no lead in them (this window is not the lead's footage)"
        )
    return verdict
