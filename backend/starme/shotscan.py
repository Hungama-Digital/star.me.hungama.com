"""Derive the swap manifest from the footage instead of from someone's notes.

Every wrong face this product has shipped came from a hand-written list of
where the lead appears. The content team's list designated 48s of Episode 1
when about 28s contains him, which is how the co-star's own close-up came back
wearing a subscriber's face. A hand-made replacement was better and still
missed a bus-aisle shot, judged from one frame with the lead standing behind
her.

So the question is asked of the footage, frame by frame: is the ORIGINAL lead
on screen here? Frame level rather than shot level, because a single "shot" in
Episode 1 runs the co-star's extreme close-up straight into a two-shot with no
detectable cut between them - designating that whole shot would send her face
to the provider, which is the exact failure this exists to prevent.

THE RULE, and why it is shaped this way. Measured on Episode 1:

  * The co-star's close-ups fill 19% to 64% of frame and score 0.15 to 0.28
    against the lead. Big face, low score: confidently not him, excluded.
  * The lead scores 0.40 to 0.94 wherever his face is reasonably sized.
  * In the bus aisle every face is 0.15% to 0.77% of frame and scores 0.05 to
    0.36 - noise. Nothing that small can be identified by embedding at all.

Judging a face too small to judge is how the aisle shot was missed. So a face
big enough to identify is trusted, and a face too small to identify is counted
as present, because it cannot be ruled out. That errs toward swapping a tiny
unidentifiable face rather than leaving the lead unswapped - and every
catastrophic mis-swap so far involved a LARGE face, which this rule excludes
confidently.
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

#: How often the master is examined. Fine enough that a window boundary lands
#: within a couple of frames of the real one.
SAMPLE_INTERVAL = 0.25
#: Below this share of the frame a face carries too few pixels for the
#: embedding to mean anything. Measured: the co-star's smallest confidently
#: judged face was 2.66%, and every aisle face was under 0.8%.
IDENTIFIABLE_FACE_AREA = 0.015
#: Faces smaller than this are detector noise rather than people.
MIN_FACE_AREA = 0.0005
#: A designated run must last at least this long, so one stray frame does not
#: become a provider call.
MIN_RUN_SECONDS = 0.4
#: Designated runs closer together than this are joined. Cheaper as one call,
#: and it avoids a seam in the timeline for the sake of a few frames.
MERGE_GAP_SECONDS = 0.6
#: Scene-change sensitivity, used only to tidy window edges onto real cuts.
SCENE_THRESHOLD = 0.12
#: How far a window edge may move to land on a cut.
SNAP_SECONDS = 0.35


@dataclass(frozen=True)
class FrameVerdict:
    at: float
    designated: bool
    reason: str
    best_similarity: float
    largest_face_area: float


@dataclass(frozen=True)
class Window:
    start: float
    duration: float

    @property
    def end(self) -> float:
        return self.start + self.duration


def scene_cuts(video: Path, *, threshold: float = SCENE_THRESHOLD) -> list[float]:
    """Timestamps where the picture changes enough to be a different shot."""
    completed = subprocess.run(  # noqa: S603
        [  # noqa: S607 - ffmpeg is this package's standing media dependency
            "ffmpeg", "-v", "error", "-i", str(video),
            "-vf", f"select='gt(scene,{threshold})',metadata=print:file=-",
            "-an", "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return sorted(
        {round(float(m), 3) for m in re.findall(r"pts_time:([0-9.]+)", completed.stdout)}
    )


def _sample_all(video: Path, out_dir: Path, interval: float) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(  # noqa: S603
        [  # noqa: S607
            "ffmpeg", "-y", "-v", "error", "-i", str(video),
            "-vf", f"fps=1/{interval}", "-q:v", "3", str(out_dir / "f%05d.jpg"),
        ],
        check=True,
        capture_output=True,
    )
    return sorted(out_dir.glob("f*.jpg"))


def judge_frames(
    master: Path,
    lead_portrait: Path,
    *,
    embedder: EmbedFn | None = None,
    interval: float = SAMPLE_INTERVAL,
) -> list[FrameVerdict]:
    """Whether the lead could be on screen, at every sampled moment."""
    embedder = embedder or _insightface_embedder()
    lead = reference_embedding(lead_portrait, embedder)
    verdicts: list[FrameVerdict] = []
    with tempfile.TemporaryDirectory() as scratch:
        for index, frame in enumerate(_sample_all(master, Path(scratch), interval)):
            faces = [(emb, area) for emb, area in embedder(frame) if area >= MIN_FACE_AREA]
            at = round(index * interval, 3)
            if not faces:
                verdicts.append(FrameVerdict(at, False, "no face", 0.0, 0.0))
                continue
            best = max(_cosine(lead, emb) for emb, _ in faces)
            largest = max(area for _, area in faces)
            matched = any(
                _cosine(lead, emb) >= PASS_SIMILARITY
                for emb, area in faces
                if area >= IDENTIFIABLE_FACE_AREA
            )
            # A face too small to identify cannot be ruled out, so it counts as
            # the lead possibly being here. This is what the aisle shot needed.
            unidentifiable = any(area < IDENTIFIABLE_FACE_AREA for _, area in faces)
            if matched:
                reason = "lead matched"
            elif unidentifiable:
                reason = "face too small to rule out"
            else:
                reason = "identified, not the lead"
            verdicts.append(
                FrameVerdict(
                    at,
                    matched or unidentifiable,
                    reason,
                    round(best, 3),
                    round(largest, 5),
                )
            )
    return verdicts


def _snap(value: float, cuts: list[float], limit: float = SNAP_SECONDS) -> float:
    """Move a window edge onto a real cut when one is close enough."""
    if not cuts:
        return value
    nearest = min(cuts, key=lambda c: abs(c - value))
    return round(nearest, 3) if abs(nearest - value) <= limit else round(value, 3)


def windows(
    verdicts: list[FrameVerdict],
    *,
    interval: float = SAMPLE_INTERVAL,
    cuts: list[float] | None = None,
    total_duration: float | None = None,
) -> list[Window]:
    """Runs of designated frames, merged and tidied onto shot boundaries."""
    runs: list[list[float]] = []
    for verdict in verdicts:
        if not verdict.designated:
            continue
        end = verdict.at + interval
        if runs and verdict.at - runs[-1][1] <= MERGE_GAP_SECONDS:
            runs[-1][1] = end
        else:
            runs.append([verdict.at, end])

    cuts = cuts or []
    result: list[Window] = []
    for start, end in runs:
        if end - start < MIN_RUN_SECONDS:
            continue
        start = _snap(start, cuts)
        end = _snap(end, cuts)
        if total_duration is not None:
            end = min(end, total_duration)
        start = max(0.0, start)
        if end - start >= MIN_RUN_SECONDS:
            result.append(Window(round(start, 3), round(end - start, 3)))
    return result


def scan(
    master: Path,
    lead_portrait: Path,
    *,
    duration: float,
    embedder: EmbedFn | None = None,
    interval: float = SAMPLE_INTERVAL,
) -> tuple[list[FrameVerdict], list[Window]]:
    """Judge every frame, then turn the designated runs into windows."""
    verdicts = judge_frames(master, lead_portrait, embedder=embedder, interval=interval)
    return verdicts, windows(
        verdicts, interval=interval, cuts=scene_cuts(master), total_duration=duration
    )


def manifest_entries(
    found: list[Window], *, episode: int, role_character: str, co_stars: str = ""
) -> list[dict[str, object]]:
    """The designated windows in the shot-manifest shape the pipeline reads."""
    characters = role_character + (f", {co_stars}" if co_stars else "")
    return [
        {
            "episode": episode,
            "clip": f"ep{episode:02d}_{role_character.lower()}_auto_{index + 1:02d}",
            "start": window.start,
            "duration": window.duration,
            "characters": characters,
        }
        for index, window in enumerate(found)
    ]


def report(verdicts: list[FrameVerdict], found: list[Window]) -> str:
    """What the scan decided, in a form a person can argue with."""
    designated_seconds = sum(w.duration for w in found)
    lines = [
        f"{len(verdicts)} frames judged | {len(found)} windows | "
        f"{designated_seconds:.1f}s designated",
        "",
        "windows:",
    ]
    lines += [f"  {w.start:>7.2f} -> {w.end:>7.2f}  ({w.duration:.2f}s)" for w in found]
    lines += ["", "frames not designated, with a face big enough to judge:"]
    for verdict in verdicts:
        if not verdict.designated and verdict.largest_face_area >= IDENTIFIABLE_FACE_AREA:
            lines.append(
                f"  {verdict.at:>7.2f}  sim {verdict.best_similarity:>5.2f}  "
                f"face {verdict.largest_face_area * 100:>5.2f}%  {verdict.reason}"
            )
    return "\n".join(lines)


def write_manifest(entries: list[dict[str, object]], destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(entries, indent=1) + "\n")
    return destination
