from __future__ import annotations

import json
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any

from redis import Redis
from rq import Queue

from starme.byteplus_assets import BytePlusAssetClient
from starme.config import Settings, get_settings
from starme.linode_storage import LinodeObjectStorage
from starme.media_pipeline import remux_original_audio, structural_quality_report
from starme.prompts import face_swap_prompt, subject_replacement_prompt
from starme.seedance import SeedanceClient, SeedanceGenerationRequest


@dataclass(frozen=True)
class SeedanceRenderSpec:
    reference: str
    source_video_url: str
    source_video_path: str
    original_audio_path: str
    reference_asset_uris: tuple[str, ...]
    prompt_variant: str = "face_swap_direct_v2"
    ratio: str = "adaptive"
    duration: int | None = None
    # face_swap_direct_v1 inputs; the subject description is content-owner
    # metadata identifying the designated role, never inferred from pixels.
    subject_video_desc: str = ""
    image_desc: str = ""
    extra_notes: str = ""

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SeedanceRenderSpec:
        return cls(
            reference=str(data["reference"]),
            source_video_url=str(data["source_video_url"]),
            source_video_path=str(data["source_video_path"]),
            original_audio_path=str(data["original_audio_path"]),
            reference_asset_uris=tuple(str(item) for item in data["reference_asset_uris"]),
            prompt_variant=str(data.get("prompt_variant", "face_swap_direct_v2")),
            ratio=str(data.get("ratio", "adaptive")),
            duration=int(data["duration"]) if data.get("duration") is not None else None,
            subject_video_desc=str(data.get("subject_video_desc", "")),
            image_desc=str(data.get("image_desc", "")),
            extra_notes=str(data.get("extra_notes", "")),
        )


@dataclass(frozen=True)
class SeedanceRenderResult:
    reference: str
    provider_task_id: str
    generated_video_path: str
    final_video_path: str
    quality_report_path: str
    quality_passed: bool


def _client(settings: Settings) -> SeedanceClient:
    if settings.byteplus_api_key is None:
        raise RuntimeError("STARME_BYTEPLUS_API_KEY is required")
    return SeedanceClient(
        api_key=settings.byteplus_api_key.get_secret_value(),
        base_url=settings.byteplus_api_base_url,
    )


def _asset_client(settings: Settings) -> BytePlusAssetClient:
    if settings.byteplus_access_key is None or settings.byteplus_secret_key is None:
        raise RuntimeError("BytePlus AK/SK are required to register render assets")
    return BytePlusAssetClient(
        access_key=settings.byteplus_access_key.get_secret_value(),
        secret_key=settings.byteplus_secret_key.get_secret_value(),
        region=settings.byteplus_region,
        project_name=settings.byteplus_project_name,
    )


def stage_inputs(spec: SeedanceRenderSpec, settings: Settings) -> SeedanceRenderSpec:
    """Host and register render inputs so every reference is an asset:// URI.

    Proven 20 August 2026: a local file is uploaded to Linode for a fetchable
    HTTPS URL, then registered into the AIGC asset group, which is what clears
    BytePlus real-face input moderation. Hosted objects are deleted after
    registration because the CDN bucket is public. Already-registered asset://
    references pass through unchanged.
    """
    group_id = settings.byteplus_asset_group_id
    if not group_id:
        return spec

    storage = LinodeObjectStorage.from_settings(settings)
    hosted_keys: list[str] = []

    def hosted_url(local_path: str) -> str:
        if storage is None:
            raise RuntimeError("Linode storage is not configured for render input hosting")
        path = Path(local_path)
        key = storage.object_key(path.name)
        suffix = path.suffix.lower()
        content_type = "video/mp4" if suffix in {".mp4", ".mov"} else "image/png"
        storage.put(key, path.read_bytes(), content_type)
        hosted_keys.append(key)
        return storage.public_url(key)

    client = _asset_client(settings)

    def registered(url: str, asset_type: str, name: str) -> str:
        asset = client.ensure_active_asset(
            group_id=group_id, source_url=url, asset_type=asset_type, name=name
        )
        return asset.uri

    try:
        video_ref = spec.source_video_url
        if not video_ref:
            video_ref = hosted_url(spec.source_video_path)
        if not video_ref.startswith("asset://"):
            video_ref = registered(video_ref, "Video", f"{spec.reference}-source")
        image_refs = tuple(
            ref
            if ref.startswith("asset://")
            else registered(ref, "Image", f"{spec.reference}-face")
            for ref in spec.reference_asset_uris
        )
    finally:
        for key in hosted_keys:
            if storage is not None:
                storage.delete(key)
    return replace(spec, source_video_url=video_ref, reference_asset_uris=image_refs)


def _build_prompt(spec: SeedanceRenderSpec) -> str:
    if spec.prompt_variant.startswith("face_swap_direct"):
        return face_swap_prompt(
            subject_video_desc=spec.subject_video_desc,
            image_desc=spec.image_desc,
            extra_notes=spec.extra_notes,
        ).text
    return subject_replacement_prompt(variant=spec.prompt_variant).text


def execute_seedance_render(
    spec_data: dict[str, Any], settings: Settings | None = None
) -> dict[str, Any]:
    settings = settings or get_settings()
    spec = stage_inputs(SeedanceRenderSpec.from_dict(spec_data), settings)
    work_dir = Path(settings.render_work_dir).resolve() / spec.reference
    work_dir.mkdir(parents=True, exist_ok=True)
    generated = work_dir / "generated-silent.mp4"
    final = work_dir / "final-with-original-audio.mp4"
    report_path = work_dir / "quality-report.json"
    prompt = _build_prompt(spec)
    # Seedance 2.5 edit tasks must use ratio=adaptive and duration=-1; the
    # output then follows the input video (observed drift ~0.3s, within the
    # structural gate's 0.75s tolerance).
    is_v25 = "seedance-2-5" in settings.byteplus_model
    request = SeedanceGenerationRequest(
        source_video_url=spec.source_video_url,
        reference_asset_uris=spec.reference_asset_uris,
        prompt=prompt,
        model=settings.byteplus_model,
        ratio="adaptive" if is_v25 else spec.ratio,
        duration=-1 if is_v25 else spec.duration,
        generate_audio=False,
        # The product-approved 20 August run used the Studio default
        # (watermark off); the provider's "AI generated" badge otherwise
        # burns into every swapped shot. Internal watermarking policy is
        # a separate open Director decision recorded in the handover.
        watermark=False,
    )
    with _client(settings) as client:
        submitted = client.submit(request)
        completed = client.wait(
            submitted.id,
            timeout_seconds=settings.byteplus_task_timeout_seconds,
            poll_interval_seconds=settings.byteplus_poll_interval_seconds,
        )
        assert completed.output_url is not None
        client.download(completed.output_url, generated)
    remux_original_audio(generated, Path(spec.original_audio_path), final)
    report = structural_quality_report(Path(spec.source_video_path), final)
    report_path.write_text(json.dumps(asdict(report), indent=2, sort_keys=True) + "\n")
    result = SeedanceRenderResult(
        reference=spec.reference,
        provider_task_id=completed.id,
        generated_video_path=str(generated),
        final_video_path=str(final),
        quality_report_path=str(report_path),
        quality_passed=report.passed,
    )
    if not report.passed:
        raise RuntimeError(f"Seedance output failed structural quality gates: {report.checks}")
    return asdict(result)


def enqueue_seedance_render(spec: SeedanceRenderSpec, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    if settings.queue_backend == "inline":
        execute_seedance_render(asdict(spec), settings)
        return f"inline:{spec.reference}"
    queue = Queue("starme-seedance", connection=Redis.from_url(settings.redis_url))
    job = queue.enqueue(
        execute_seedance_render,
        asdict(spec),
        job_timeout=settings.byteplus_task_timeout_seconds + 300,
        result_ttl=86400,
        failure_ttl=604800,
    )
    return job.id


def cancel_seedance_task(task_id: str, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    with _client(settings) as client:
        client.cancel(task_id)
