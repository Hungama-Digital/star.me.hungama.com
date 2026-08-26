"""Derive the swap manifest from the footage instead of from someone's notes.

Every wrong face this product has shipped came from a hand-written list of
where the lead appears. The content team's list designated 48s of Episode 1
when only ~28s contains him, which is how the co-star's own close-up came back
wearing a subscriber's face. My replacement list was better and still missed a
bus-aisle shot, because I judged each shot from a single midpoint frame and he
was standing behind her.

A list is the wrong artefact. What the pipeline actually needs is the answer to
one question, per shot: is the ORIGINAL lead's face on screen here? That is
answerable from the master and a still of the lead, and answering it the same
way every time removes the entire class of error - including for Episodes 2 and
3, whose lists have never been checked at all.

Deliberately conservative in the direction that matters. A shot wrongly
designated sends footage the lead is not in, which is what puts his face on
somebody else; a shot wrongly skipped merely leaves the original actor there.
So a single frame's match is not enough, and the presence threshold is small
rather than generous: the aisle face nobody swapped was under a fifth of one
percent of frame area, and it was noticed.
"""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from starme.face_qa import (
    PASS_SIMILARITY,
    EmbedFn,
    _cosine,
    _insightface_embedder,
    reference_embedding,
)

#: Scene-change sensitivity. 0.12 found every cut in Episode 1 that a
#: frame-by-frame read of the master also found; 0.30 missed several.
SCENE_THRESHOLD = 0.12
#: How often to look inside a shot. Fine enough that a shot barely over a
#: second still yields several samples.
SAMPLE_INTERVAL = 0.25
#: Smallest share of the frame a face can occupy and still be worth swapping.
#: The unswapped aisle face measured about 0.17%, so this sits below that.
MIN_FACE_AREA = 0.001
#: Frames that must match the lead before a shot is designated. One is not
#: enough: a single false match would send footage he is absent from.
MIN_MATCHING_FRAMES = 2
#: Shots shorter than this are not worth a provider call on their own; they
#: still ride along inside a batch (see episode_assembly.batch_shots).
MIN_SHOT_SECONDS = 0.2


@dataclass(frozen=True)
class ScannedShot:
    start: float
    duration: float
    frames_sampled: int
    frames_matching_lead: int
    best_similarity: float
    largest_face_area: float

    @property
    def end(self) -> float:
        return self.start + self.duration

    @property
    def has_lead(self) -> bool:
        return self.frames_matching_lead >= MIN_MATCHING_FRAMES


def scene_cuts(video: Path, *, threshold: float = SCENE_THRESHOLD) -> list[float]:
    """Timestamps where the picture changes enough to be a different shot."""
    completed = subprocess.run(  # noqa: S603
        [  # noqa: S607 - ffmpeg is this package's standing media dependency
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(video),
            "-vf",
            f"select='gt(scene,{threshold})',metadata=print:file=-",
            "-an",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return sorted(
        {round(float(m), 3) for m in re.findall(r"pts_time:([0-9.]+)", completed.stdout)}
    )


def shot_boundaries(
    video: Path, duration: float, *, threshold: float = SCENE_THRESHOLD
) -> list[tuple[float, float]]:
    """The video as a list of (start, duration) shots."""
    inside = [c for c in scene_cuts(video, threshold=threshold) if 0 < c < duration]
    marks = [0.0, *inside, duration]
    return [
        (start, round(end - start, 3))
        for start, end in zip(marks, marks[1:], strict=False)
        if end - start >= MIN_SHOT_SECONDS
    ]


def _sample(video: Path, start: float, duration: float, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(  # noqa: S603
        [  # noqa: S607
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-ss",
            str(start),
            "-i",
            str(video),
            "-t",
            str(duration),
            "-vf",
            f"fps=1/{SAMPLE_INTERVAL}",
            "-q:v",
            "3",
            str(out_dir / "s%04d.jpg"),
        ],
        check=True,
        capture_output=True,
    )
    return sorted(out_dir.glob("s*.jpg"))


def scan(
    master: Path,
    lead_portrait: Path,
    *,
    duration: float,
    embedder: EmbedFn | None = None,
    threshold: float = SCENE_THRESHOLD,
) -> list[ScannedShot]:
    """Every shot in the master, with whether the original lead is in it."""
    embedder = embedder or _insightface_embedder()
    lead = reference_embedding(lead_portrait, embedder)
    results: list[ScannedShot] = []
    with tempfile.TemporaryDirectory() as scratch:
        boundaries = shot_boundaries(master, duration, threshold=threshold)
        for index, (start, span) in enumerate(boundaries):
            frames = _sample(master, start, span, Path(scratch) / f"shot{index:04d}")
            matching = 0
            best = 0.0
            biggest = 0.0
            for frame in frames:
                faces = [
                    (emb, area) for emb, area in embedder(frame) if area >= MIN_FACE_AREA
                ]
                if not faces:
                    continue
                biggest = max(biggest, max(area for _, area in faces))
                similarity = max(_cosine(lead, emb) for emb, _ in faces)
                best = max(best, similarity)
                if similarity >= PASS_SIMILARITY:
                    matching += 1
            results.append(
                ScannedShot(
                    start=round(start, 3),
                    duration=span,
                    frames_sampled=len(frames),
                    frames_matching_lead=matching,
                    best_similarity=round(best, 4),
                    largest_face_area=round(biggest, 5),
                )
            )
    return results


def designated(shots: list[ScannedShot]) -> list[tuple[float, float]]:
    """Merge the lead's shots into contiguous (start, duration) windows.

    Adjacent shots are joined because a batch of continuous footage is one
    provider call rather than two, and because a cut inside a window is
    something the model handles better than a seam in the timeline does.
    """
    windows: list[list[float]] = []
    for shot in shots:
        if not shot.has_lead:
            continue
        if windows and abs(shot.start - windows[-1][1]) < 0.05:
            windows[-1][1] = shot.end
        else:
            windows.append([shot.start, shot.end])
    return [(round(a, 3), round(b - a, 3)) for a, b in windows]


def manifest_entries(
    shots: list[ScannedShot], *, episode: int, role_character: str, co_stars: str = ""
) -> list[dict[str, object]]:
    """The designated windows in the shot-manifest shape the pipeline reads."""
    characters = role_character + (f", {co_stars}" if co_stars else "")
    return [
        {
            "episode": episode,
            "clip": f"ep{episode:02d}_{role_character.lower()}_auto_{index + 1:02d}",
            "start": start,
            "duration": span,
            "characters": characters,
        }
        for index, (start, span) in enumerate(designated(shots))
    ]


def report(shots: list[ScannedShot]) -> str:
    """A human-readable scan, so a person can sanity-check the machine."""
    lines = [
        f"{len(shots)} shots | "
        f"{sum(1 for s in shots if s.has_lead)} contain the lead | "
        f"{sum(s.duration for s in shots if s.has_lead):.1f}s designated of "
        f"{sum(s.duration for s in shots):.1f}s",
        "",
        f"{'start':>8} {'dur':>6} {'frames':>7} {'match':>6} {'sim':>6} {'face%':>7}  lead",
    ]
    for shot in shots:
        lines.append(
            f"{shot.start:>8.2f} {shot.duration:>6.2f} {shot.frames_sampled:>7} "
            f"{shot.frames_matching_lead:>6} {shot.best_similarity:>6.2f} "
            f"{shot.largest_face_area * 100:>6.2f}%  {'YES' if shot.has_lead else '-'}"
        )
    return "\n".join(lines)


def write_manifest(entries: list[dict[str, object]], destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(entries, indent=1) + "\n")
    return destination
