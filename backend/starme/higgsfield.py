"""Higgsfield Genjutsu object swap, the render provider when
STARME_RENDER_PROVIDER=higgsfield.

The model behind Prabhakar's manual workflow, measured on the EP-01 test in
November 2026, where it beat Seedance on likeness in the close-ups. It keeps
the contract of ``execute_seedance_render``, so episode assembly, the face-QA
re-rolls and the QC gate run unchanged around it.

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

import json
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

BASE_URL = "https://api.higgsfield.ai"
APP = "/higgsfield/genjutsu/object-swap/v1.0"
PAD_SECONDS = 1.5
POLL_SECONDS = 10.0
DONE = {"completed", "failed", "nsfw", "canceled"}


def swap_prompt(subject_video_desc: str, extra_notes: str = "") -> str:
    """The EP-01 test prompt with the subscriber-specific looks taken out: the
    reference image carries the identity, the shell names who to replace."""
    subject = subject_video_desc or "the main male lead"
    return (
        "No subtitles, no captions, no on-screen text of any kind. "
        f"Replace the main subject, {subject} @[Video 1](video_1), with the person "
        "in the reference image @[Image 1](image_1). Face replacement is the only "
        "task. In every frame, including close-ups, over-the-shoulder and wide shots, "
        "he has the reference person's exact face: eyes, brow, nose, face shape, "
        "chin and cheeks, hair and hairline, facial hair, skin tone and age. The "
        "original actor's face, hair, facial hair and jewellery must be completely "
        "gone; he must not look like the original actor.\n"
        "Keep his exact performance: dialogue, lip movements, expressions, eye "
        "direction, blinks, breathing, head movements and timing, and his costume.\n"
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
    with HiggsfieldClient(settings.higgsfield_api_key.get_secret_value(), transport) as client:
        request_id = client.submit(
            {
                "video_url": client.upload(padded),
                "image_urls": [client.upload(Path(p)) for p in spec.reference_asset_uris],
                "prompt": swap_prompt(spec.subject_video_desc, spec.extra_notes),
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
