from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace

import pytest

from starme.config import Settings
from starme.media_pipeline import MediaProbe, QualityReport
from starme.render_pipeline import (
    SeedanceRenderSpec,
    enqueue_seedance_render,
    execute_seedance_render,
)
from starme.seedance import SeedanceTask


class FakeClient:
    def __enter__(self):  # type: ignore[no-untyped-def]
        return self

    def __exit__(self, *_):  # type: ignore[no-untyped-def]
        return None

    def submit(self, request):  # type: ignore[no-untyped-def]
        assert request.generate_audio is False
        assert request.watermark is True
        return SeedanceTask(id="provider-1", status="queued")

    def wait(self, task_id, **kwargs):  # type: ignore[no-untyped-def]
        assert task_id == "provider-1"
        assert kwargs["timeout_seconds"] == 900
        return SeedanceTask(
            id=task_id, status="succeeded", output_url="https://output.example/video.mp4"
        )

    def download(self, output_url, destination):  # type: ignore[no-untyped-def]
        assert output_url.startswith("https://")
        destination.write_bytes(b"generated")
        return destination


def spec(tmp_path: Path) -> SeedanceRenderSpec:
    return SeedanceRenderSpec(
        reference="proof-001",
        source_video_url="https://media.example/shot.mp4",
        source_video_path=str(tmp_path / "shot.mp4"),
        original_audio_path=str(tmp_path / "audio.m4a"),
        reference_asset_uris=("asset://authorized-front",),
    )


def test_execute_orchestrates_download_remux_and_quality_report(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    media_probe = MediaProbe(5, 1080, 1920, "h264", True)
    quality = QualityReport(True, {"duration_preserved": True}, media_probe, media_probe)
    monkeypatch.setattr("starme.render_pipeline._client", lambda settings: FakeClient())
    monkeypatch.setattr(
        "starme.render_pipeline.remux_original_audio",
        lambda generated, audio, final: final.write_bytes(b"final") or final,
    )
    monkeypatch.setattr("starme.render_pipeline.structural_quality_report", lambda *_: quality)
    settings = Settings(render_work_dir=str(tmp_path / "renders"), byteplus_api_key="test")

    result = execute_seedance_render(asdict(spec(tmp_path)), settings)

    assert result["provider_task_id"] == "provider-1"
    assert result["quality_passed"] is True
    assert Path(result["quality_report_path"]).is_file()


def test_inline_queue_executes_immediately(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[dict[str, object]] = []
    monkeypatch.setattr(
        "starme.render_pipeline.execute_seedance_render",
        lambda data, settings: called.append(data) or {},
    )
    settings = Settings(queue_backend="inline", byteplus_api_key="test")

    reference = enqueue_seedance_render(spec(tmp_path), settings)

    assert reference == "inline:proof-001"
    assert called[0]["reference"] == "proof-001"


def test_rq_queue_uses_dedicated_queue(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeQueue:
        def __init__(self, name, connection):  # type: ignore[no-untyped-def]
            captured["name"] = name

        def enqueue(self, function, payload, **kwargs):  # type: ignore[no-untyped-def]
            captured["function"] = function
            captured["payload"] = payload
            captured["kwargs"] = kwargs
            return SimpleNamespace(id="rq-1")

    monkeypatch.setattr("starme.render_pipeline.Redis.from_url", lambda _: object())
    monkeypatch.setattr("starme.render_pipeline.Queue", FakeQueue)
    settings = Settings(queue_backend="rq", byteplus_api_key="test")

    job_id = enqueue_seedance_render(spec(tmp_path), settings)

    assert job_id == "rq-1"
    assert captured["name"] == "starme-seedance"
