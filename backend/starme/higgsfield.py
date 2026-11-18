"""Higgsfield Genjutsu object swap, the render provider when
STARME_RENDER_PROVIDER=higgsfield.

The model behind Prabhakar's manual workflow, measured on the EP-01 test in
November 2026, where it beat Seedance on likeness in the close-ups. It keeps
the contract of ``execute_seedance_render``, so episode assembly, the face-QA
re-rolls and the QC gate run unchanged around it.

Before any swap, the selfie becomes a three-panel character sheet with
gpt-image-2 (front, back, close-up, in the episode costume): Prabhakar's
manual step, and the references the EP-01 test used. The sheet and its
close-up panel go to Genjutsu together. Made once per selfie and cached.

Two differences from Seedance:
- The face reference is the subscriber's portrait FILE, uploaded with each
  call. Higgsfield accepts real faces directly, so there is no asset://
  registration step and no asset group.
- Genjutsu renders whole seconds and drops the tail (6.2s in, 5.7s out), so
  each clip goes up padded with frozen frames and comes back trimmed.

Billing per output second, rounded up: about $0.318/s at 480p, $0.681/s at
720p. Failed and NSFW-blocked jobs are not charged.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import mimetypes
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

import httpx

from starme.config import Settings, get_settings
from starme.media_pipeline import (
    _run,
    probe_media,
    remux_original_audio,
    structural_quality_report,
)
from starme.render_pipeline import SeedanceRenderResult, SeedanceRenderSpec

LOGGER = logging.getLogger(__name__)
BASE_URL = "https://api.higgsfield.ai"
APP = "/higgsfield/genjutsu/object-swap/v1.0"
PAD_SECONDS = 1.5
POLL_SECONDS = 10.0
DONE = {"completed", "failed", "nsfw", "canceled"}


# Prabhakar's "Character sheet.docx" prompt, as run on 28/10/2026, with the
# person and costume made generic.
SHEET_PROMPT = (
    "The character is the person in the attached photo. Keep their exact face: bone "
    "structure, eyes, nose, mouth, jawline, hairline and hair, facial hair, skin tone "
    "and age. Do not make them younger, slimmer or more symmetrical. They wear the "
    "same outfit as {costume}. No sunglasses.\n\n"
    "Create one landscape image with three panels on a seamless, solid grey studio "
    "background, separated by thin vertical divider lines.\n"
    "Panel 1, Full-Body Front View: standing upright in a neutral pose, facing the "
    "camera, arms relaxed at the sides, the entire figure from head to toe visible.\n"
    "Panel 2, Full-Body Back View: the same pose facing away from the camera, clearly "
    "showing the back of the costume, hairstyle, accessories and footwear.\n"
    "Panel 3, Close-Up Portrait: a frontal head-and-shoulders close-up, looking "
    "directly at the camera.\n"
    "Visual Style and Quality: Hyperrealistic RAW photograph, shot on a full-frame "
    "DSLR camera with an 85mm lens, a real human being with natural skin pores, fine "
    "facial details, realistic eyes and authentic fabric textures.\n"
    "Strict Requirements: the exact same facial identity, body proportions, "
    "hairstyle, costume and accessories across all three panels. Soft, even studio "
    "lighting with consistent exposure. No cartoon style, 3D render, CGI, "
    "illustration, text, labels, logos or watermarks."
)


def character_sheet(
    portrait: Path,
    costume: str,
    settings: Settings,
    transport: httpx.BaseTransport | None = None,
) -> list[Path]:
    """[sheet, close-up panel] for this selfie and costume, made once and cached.

    Falls back to the bare portrait when the image model is missing or refuses:
    the swap still runs and face QA still judges it, it just loses the sheet's
    help on profile and back-of-head shots.
    """
    raw = portrait.read_bytes()
    key = hashlib.sha256(raw + costume.encode()).hexdigest()[:20]
    folder = Path(settings.render_work_dir).resolve() / "sheets" / key
    sheet, closeup = folder / "sheet.png", folder / "closeup.png"
    if closeup.is_file():
        return [sheet, closeup]
    if settings.openai_api_key is None:
        LOGGER.warning("No STARME_OPENAI_API_KEY; swapping from the bare portrait")
        return [portrait]
    with httpx.Client(
        base_url=settings.openai_base_url.rstrip("/"),
        transport=transport,
        timeout=httpx.Timeout(600.0, connect=15.0),
        headers={"Authorization": f"Bearer {settings.openai_api_key.get_secret_value()}"},
    ) as client:
        response = client.post(
            "/images/edits",
            data={
                "model": settings.openai_image_model,
                "prompt": SHEET_PROMPT.format(costume=costume or "the episode's lead"),
                "n": "1",
                "size": "1536x1024",  # 3:2, as the test sheet
                "quality": "high",
            },
            files=[("image[]", ("selfie.png", raw, "image/png"))],
        )
    items = [] if response.is_error else response.json().get("data") or []
    if not items or not items[0].get("b64_json"):
        LOGGER.warning(
            "Character sheet failed (%s %s); swapping from the bare portrait",
            response.status_code,
            response.text[:200],
        )
        return [portrait]
    folder.mkdir(parents=True, exist_ok=True)
    sheet.write_bytes(base64.b64decode(items[0]["b64_json"]))
    # Panel 3 is the right third: the close-up the EP-01 close-ups needed.
    _run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(sheet)]
        + ["-vf", "crop=iw/3:ih:2*iw/3:0", str(closeup)]
    )
    return [sheet, closeup]


def swap_prompt(subject_video_desc: str, extra_notes: str = "", references: int = 1) -> str:
    """The EP-01 test prompt with the subscriber-specific looks taken out: the
    references carry the identity, the shell names who to replace."""
    subject = subject_video_desc or "the main male lead"
    refs = " and ".join(f"@[Image {n}](image_{n})" for n in range(1, references + 1))
    return (
        "No subtitles, no captions, no on-screen text of any kind. "
        f"Replace the main subject, {subject} @[Video 1](video_1), with the person "
        f"in the reference images {refs}. Face replacement is the only "
        "task. In every frame, including close-ups, over-the-shoulder and wide shots, "
        "he has the reference person's exact face: eyes, brow, nose, face shape, "
        "chin and cheeks, hair and hairline, facial hair, skin tone and age. The "
        "original actor's face, hair, facial hair and jewellery must be completely "
        "gone; he must not look like the original actor.\n"
        "Keep his exact performance: dialogue, lip movements, expressions, eye "
        "direction, blinks, breathing, head movements and timing.\n"
        "Do not change any other person, the location, the lighting, the camera or "
        f"the edit. {extra_notes}"
    ).strip()


class HiggsfieldClient:
    def __init__(self, key: str, transport: httpx.BaseTransport | None = None) -> None:
        self._api = httpx.Client(
            base_url=BASE_URL,
            headers={"Authorization": f"Key {key}"},
            timeout=120,
            transport=transport,
        )
        # Pre-signed upload and result URLs must not receive the API key.
        self._files = httpx.Client(timeout=600, follow_redirects=True, transport=transport)

    def __enter__(self) -> HiggsfieldClient:
        return self

    def __exit__(self, *_: object) -> None:
        self._api.close()
        self._files.close()

    @staticmethod
    def _ok(response: httpx.Response) -> dict[str, Any]:
        if response.is_error:
            # not_enough_credits arrives here; the body says so, keep it.
            raise RuntimeError(f"Higgsfield {response.status_code}: {response.text[:300]}")
        return dict(response.json())

    def upload(self, path: Path) -> str:
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        slot = self._ok(
            self._api.post("/files/generate-upload-url", json={"content_type": content_type})
        )
        put = self._files.put(
            slot["upload_url"],
            content=path.read_bytes(),
            headers=slot.get("upload_headers") or {"Content-Type": content_type},
        )
        put.raise_for_status()
        return str(slot["public_url"])

    def submit(self, arguments: dict[str, Any]) -> str:
        return str(self._ok(self._api.post(APP, json=arguments))["request_id"])

    def wait(self, request_id: str, *, timeout_seconds: float) -> dict[str, Any]:
        deadline = time.monotonic() + timeout_seconds
        while True:
            data = self._ok(self._api.get(f"/requests/{request_id}/status"))
            state = str(data.get("status"))
            if state == "completed":
                return data
            if state in DONE:
                raise RuntimeError(f"Higgsfield request {request_id} ended {state} (not charged)")
            if time.monotonic() > deadline:
                raise RuntimeError(f"Higgsfield request {request_id} still {state} at timeout")
            time.sleep(POLL_SECONDS)

    def cancel(self, request_id: str) -> None:
        self._ok(self._api.post(f"/requests/{request_id}/cancel"))

    def download(self, url: str, destination: Path) -> Path:
        response = self._files.get(url)
        response.raise_for_status()
        destination.write_bytes(response.content)
        return destination


def execute_higgsfield_render(
    spec_data: dict[str, Any],
    settings: Settings | None = None,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    if settings.higgsfield_api_key is None:
        raise RuntimeError("STARME_HIGGSFIELD_API_KEY is required")
    spec = SeedanceRenderSpec.from_dict(spec_data)
    work_dir = Path(settings.render_work_dir).resolve() / spec.reference
    work_dir.mkdir(parents=True, exist_ok=True)
    source = Path(spec.source_video_path)
    padded = work_dir / "higgsfield-input.mp4"
    raw = work_dir / "higgsfield-output.mp4"
    generated = work_dir / "generated-silent.mp4"
    final = work_dir / "final-with-original-audio.mp4"
    report_path = work_dir / "quality-report.json"

    probe = probe_media(source)
    _run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(source)]
        + ["-vf", f"tpad=stop_mode=clone:stop_duration={PAD_SECONDS}"]
        + ["-af", f"apad=pad_dur={PAD_SECONDS}"]
        + ["-c:v", "libx264", "-crf", "14", "-c:a", "aac", str(padded)]
    )
    references = [
        ref
        for p in spec.reference_asset_uris
        for ref in character_sheet(Path(p), spec.subject_video_desc, settings, transport)
    ]
    with HiggsfieldClient(settings.higgsfield_api_key.get_secret_value(), transport) as client:
        request_id = client.submit(
            {
                "video_url": client.upload(padded),
                "image_urls": [client.upload(p) for p in references],
                "prompt": swap_prompt(spec.subject_video_desc, spec.extra_notes, len(references)),
                "resolution": settings.higgsfield_resolution,
            }
        )
        done = client.wait(request_id, timeout_seconds=settings.higgsfield_timeout_seconds)
        client.download(str(done["video"]["url"]), raw)
    # Back to the source's exact length and frame size, so the structural gate
    # and the splice compare like for like.
    _run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-t", f"{probe.duration_seconds:.3f}"]
        + ["-vf", f"scale={probe.width}:{probe.height}", "-an"]
        + ["-c:v", "libx264", "-crf", "14", str(generated)]
    )
    remux_original_audio(generated, Path(spec.original_audio_path), final)
    report = structural_quality_report(source, final)
    report_path.write_text(json.dumps(asdict(report), indent=2, sort_keys=True) + "\n")
    if not report.passed:
        raise RuntimeError(f"Higgsfield output failed structural quality gates: {report.checks}")
    return asdict(
        SeedanceRenderResult(
            reference=spec.reference,
            provider_task_id=request_id,
            generated_video_path=str(generated),
            final_video_path=str(final),
            quality_report_path=str(report_path),
            quality_passed=report.passed,
        )
    )
