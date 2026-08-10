from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from redis import Redis
from rq import Queue

from starme.config import Settings, get_settings
from starme.media_pipeline import remux_original_audio, structural_quality_report
from starme.prompts import subject_replacement_prompt
from starme.seedance import SeedanceClient, SeedanceGenerationRequest


@dataclass(frozen=True)
class SeedanceRenderSpec:
    reference: str
    source_video_url: str
    source_video_path: str
    original_audio_path: str
    reference_asset_uris: tuple[str, ...]
    prompt_variant: str = "identity_lock"
    ratio: str = "adaptive"
    duration: int | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SeedanceRenderSpec:
        return cls(
            reference=str(data["reference"]),
            source_video_url=str(data["source_video_url"]),
            source_video_path=str(data["source_video_path"]),
            original_audio_path=str(data["original_audio_path"]),
            reference_asset_uris=tuple(str(item) for item in data["reference_asset_uris"]),
            prompt_variant=str(data.get("prompt_variant", "identity_lock")),
            ratio=str(data.get("ratio", "adaptive")),
            duration=int(data["duration"]) if data.get("duration") is not None else None,
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


def execute_seedance_render(
    spec_data: dict[str, Any], settings: Settings | None = None
) -> dict[str, Any]:
    settings = settings or get_settings()
    spec = SeedanceRenderSpec.from_dict(spec_data)
    work_dir = Path(settings.render_work_dir).resolve() / spec.reference
    work_dir.mkdir(parents=True, exist_ok=True)
    generated = work_dir / "generated-silent.mp4"
    final = work_dir / "final-with-original-audio.mp4"
    report_path = work_dir / "quality-report.json"
    prompt = subject_replacement_prompt(variant=spec.prompt_variant)
    request = SeedanceGenerationRequest(
        source_video_url=spec.source_video_url,
        reference_asset_uris=spec.reference_asset_uris,
        prompt=prompt.text,
        model=settings.byteplus_model,
        ratio=spec.ratio,
        duration=spec.duration,
        generate_audio=False,
        watermark=True,
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
