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
        # Run-A contract: Studio default, no provider badge on swapped shots.
        assert request.watermark is False
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
        subject_video_desc="the young man in the dark blue denim shirt (Arjun)",
        extra_notes=(
            "Keep his expression, smile and mouth movement exactly as they are in the "
            "source video; do not copy the neutral expression from the reference image."
        ),
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


def test_v25_model_forces_adaptive_and_negative_duration(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, object] = {}

    class Client25(FakeClient):
        def submit(self, request):  # type: ignore[no-untyped-def]
            captured["duration"] = request.duration
            captured["ratio"] = request.ratio
            captured["prompt"] = request.prompt
            return SeedanceTask(id="provider-1", status="queued")

    media_probe = MediaProbe(5, 1080, 1920, "h264", True)
    quality = QualityReport(True, {"duration_preserved": True}, media_probe, media_probe)
    monkeypatch.setattr("starme.render_pipeline._client", lambda settings: Client25())
    monkeypatch.setattr(
        "starme.render_pipeline.remux_original_audio",
        lambda generated, audio, final: final.write_bytes(b"final") or final,
    )
    monkeypatch.setattr("starme.render_pipeline.structural_quality_report", lambda *_: quality)
    settings = Settings(render_work_dir=str(tmp_path / "renders"), byteplus_api_key="test")
    assert "seedance-2-5" in settings.byteplus_model

    execute_seedance_render(asdict(spec(tmp_path)), settings)

    assert captured["duration"] == -1
    assert captured["ratio"] == "adaptive"
    prompt = str(captured["prompt"])
    assert prompt.startswith("Strictly edit @Video 1.")
    assert "do not copy the neutral expression" in prompt


def test_stage_inputs_hosts_registers_and_cleans_up(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from starme.byteplus_assets import PortraitAsset
    from starme.render_pipeline import stage_inputs

    (tmp_path / "shot.mp4").write_bytes(b"video-bytes")

    class FakeStorage:
        def __init__(self) -> None:
            self.deleted: list[str] = []

        def object_key(self, name):  # type: ignore[no-untyped-def]
            return f"starme/renders/random/{name}"

        def put(self, key, content, content_type):  # type: ignore[no-untyped-def]
            assert content == b"video-bytes"
            assert content_type == "video/mp4"

        def public_url(self, key):  # type: ignore[no-untyped-def]
            return f"https://images.hungama.com/{key}"

        def delete(self, key):  # type: ignore[no-untyped-def]
            self.deleted.append(key)

    class FakeAssets:
        def __init__(self) -> None:
            self.registered: list[tuple[str, str]] = []

        def ensure_active_asset(self, *, group_id, source_url, asset_type, name):  # type: ignore[no-untyped-def]
            assert group_id == "group-test"
            self.registered.append((source_url, asset_type))
            return PortraitAsset(
                id=f"reg-{len(self.registered)}",
                group_id=group_id,
                status="Active",
                asset_type=asset_type,
            )

    storage = FakeStorage()
    assets = FakeAssets()
    monkeypatch.setattr(
        "starme.render_pipeline.LinodeObjectStorage",
        SimpleNamespace(from_settings=lambda settings: storage),
    )
    monkeypatch.setattr("starme.render_pipeline._asset_client", lambda settings: assets)
    settings = Settings(byteplus_api_key="test", byteplus_asset_group_id="group-test")
    base = SeedanceRenderSpec(
        reference="proof-002",
        source_video_url="",
        source_video_path=str(tmp_path / "shot.mp4"),
        original_audio_path=str(tmp_path / "audio.m4a"),
        reference_asset_uris=("https://cdn.example/face.png", "asset://already-active"),
        subject_video_desc="the designated lead",
    )

    staged = stage_inputs(base, settings)

    assert staged.source_video_url == "asset://reg-1"
    assert staged.reference_asset_uris == ("asset://reg-2", "asset://already-active")
    hosted_url = "https://images.hungama.com/starme/renders/random/shot.mp4"
    assert assets.registered[0] == (hosted_url, "Video")
    assert assets.registered[1] == ("https://cdn.example/face.png", "Image")
    assert storage.deleted == ["starme/renders/random/shot.mp4"]


def test_stage_inputs_is_a_noop_without_an_asset_group(tmp_path: Path) -> None:
    from starme.render_pipeline import stage_inputs

    settings = Settings(byteplus_api_key="test")
    base = spec(tmp_path)

    assert stage_inputs(base, settings) is base
