import json
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from starme.config import Settings
from starme.higgsfield import execute_higgsfield_render
from starme.media_pipeline import MediaProbe, QualityReport
from starme.render_pipeline import SeedanceRenderSpec, render_fn_for
from starme.services import _seedance_order_inputs


def test_render_uploads_submits_and_never_leaks_the_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    portrait = tmp_path / "face.png"
    portrait.write_bytes(b"png")
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        path = request.url.path
        if path == "/files/generate-upload-url":
            n = sum(r.url.path == path for r in seen)
            return httpx.Response(
                200,
                json={"upload_url": f"https://up.example/{n}", "public_url": f"https://f/{n}"},
            )
        if request.url.host == "up.example":
            return httpx.Response(200)
        if path == "/higgsfield/genjutsu/object-swap/v1.0":
            return httpx.Response(200, json={"request_id": "hf-1"})
        if path == "/requests/hf-1/status":
            return httpx.Response(
                200, json={"status": "completed", "video": {"url": "https://out.example/v.mp4"}}
            )
        assert request.url.host == "out.example"
        return httpx.Response(200, content=b"video")

    monkeypatch.setattr("starme.higgsfield._run", lambda cmd: Path(cmd[-1]).write_bytes(b"x"))
    probe = MediaProbe(5.2, 720, 1280, "h264", True)
    monkeypatch.setattr("starme.higgsfield.probe_media", lambda _: probe)
    monkeypatch.setattr(
        "starme.higgsfield.remux_original_audio", lambda g, a, f: f.write_bytes(b"f") or f
    )
    monkeypatch.setattr(
        "starme.higgsfield.structural_quality_report",
        lambda *_: QualityReport(True, {"duration_preserved": True}, probe, probe),
    )
    settings = Settings(
        render_work_dir=str(tmp_path / "r"),
        higgsfield_api_key="kid:secret",  # type: ignore[arg-type]
        higgsfield_billing="api",
    )
    spec = SeedanceRenderSpec(
        reference="b1",
        source_video_url="",
        source_video_path=str(tmp_path / "in.mp4"),
        original_audio_path=str(tmp_path / "a.m4a"),
        reference_asset_uris=(str(portrait),),
        subject_video_desc="the man in the maroon polo (Arjun)",
    )

    result = execute_higgsfield_render(asdict(spec), settings, httpx.MockTransport(handler))

    assert result["provider_task_id"] == "hf-1"
    submit = next(r for r in seen if r.url.path.startswith("/higgsfield/"))
    body = json.loads(submit.content)
    assert body["resolution"] == "480p"
    assert body["image_urls"] == ["https://f/2"]
    assert "the man in the maroon polo (Arjun) @[Video 1](video_1)" in body["prompt"]
    assert submit.headers["authorization"] == "Key kid:secret"
    for request in seen:
        if request.url.host != "api.higgsfield.ai":
            assert "authorization" not in request.headers


def test_failed_request_is_reported_not_retried_silently(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.startswith("/higgsfield/"):
            return httpx.Response(402, json={"detail": "not_enough_credits"})
        return httpx.Response(200, json={"upload_url": "https://u/1", "public_url": "https://f/1"})

    monkeypatch.setattr("starme.higgsfield._run", lambda cmd: Path(cmd[-1]).write_bytes(b"x"))
    monkeypatch.setattr(
        "starme.higgsfield.probe_media", lambda _: MediaProbe(5, 720, 1280, "h264", True)
    )
    (tmp_path / "face.png").write_bytes(b"png")
    spec = SeedanceRenderSpec(
        reference="b2",
        source_video_url="",
        source_video_path=str(tmp_path / "in.mp4"),
        original_audio_path="",
        reference_asset_uris=(str(tmp_path / "face.png"),),
    )
    settings = Settings(
        render_work_dir=str(tmp_path), higgsfield_api_key="k:s", higgsfield_billing="api"
    )  # type: ignore[arg-type]
    with pytest.raises(RuntimeError, match="402.*not_enough_credits"):
        execute_higgsfield_render(asdict(spec), settings, httpx.MockTransport(handler))


def test_higgsfield_takes_priority_and_seedance_stays_switchable(tmp_path: Path) -> None:
    assert render_fn_for(Settings(render_provider="higgsfield")) is execute_higgsfield_render
    assert render_fn_for(Settings(render_provider="seedance")) is not execute_higgsfield_render
    with pytest.raises(ValueError):
        Settings(higgsfield_resolution="1080p")  # type: ignore[arg-type]


def test_higgsfield_orders_use_the_portrait_file_not_an_asset(tmp_path: Path) -> None:
    faces = tmp_path / "faces"
    faces.mkdir()
    settings = Settings(
        environment="test",
        media_dir=str(tmp_path),
        faces_dir=str(faces),
        render_provider="higgsfield",
        allow_sensitive_processing=True,
    )
    order = SimpleNamespace(
        face_asset_id="portrait://T1", shell_id="ek-love-story-001", tester_reference="T1"
    )
    with pytest.raises(RuntimeError, match="No portrait on file"):
        _seedance_order_inputs(order, settings)  # type: ignore[arg-type]
    (faces / "T1.png").write_bytes(b"png")
    shell_dir = tmp_path / "shells" / "ek-love-story-001"
    shell_dir.mkdir(parents=True)
    (shell_dir / "shot-manifest.json").write_text(
        json.dumps([{"episode": 1, "clip": "c1", "start": 1, "duration": 5, "characters": "Arjun"}])
    )
    *_, face = _seedance_order_inputs(order, settings)  # type: ignore[arg-type]
    assert face == str(faces / "T1.png")


def test_character_sheet_is_made_once_and_sent_with_its_closeup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import base64

    from starme.higgsfield import character_sheet

    portrait = tmp_path / "face.png"
    portrait.write_bytes(b"png")
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.url.path == "/v1/images/edits"
        assert b"the young man in the denim shirt" in request.content
        return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(b"S").decode()}]})

    monkeypatch.setattr("starme.higgsfield._run", lambda cmd: Path(cmd[-1]).write_bytes(b"c"))
    settings = Settings(render_work_dir=str(tmp_path), openai_api_key="sk-test")  # type: ignore[arg-type]
    costume = "the young man in the denim shirt"

    first = character_sheet(portrait, costume, settings, httpx.MockTransport(handler))
    again = character_sheet(portrait, costume, settings, httpx.MockTransport(handler))

    assert [p.name for p in first] == ["sheet.png", "closeup.png"]
    assert first == again and len(calls) == 1
    assert first[0].read_bytes() == b"S"


def test_refused_sheet_falls_back_to_the_portrait(tmp_path: Path) -> None:
    from starme.higgsfield import character_sheet, swap_prompt

    portrait = tmp_path / "face.png"
    portrait.write_bytes(b"png")
    refuse = httpx.MockTransport(lambda _: httpx.Response(400, json={"error": "moderation"}))
    settings = Settings(render_work_dir=str(tmp_path), openai_api_key="sk-test")  # type: ignore[arg-type]
    assert character_sheet(portrait, "x", settings, refuse) == [portrait]
    assert "@[Image 1](image_1) and @[Image 2](image_2)" in swap_prompt("him", "", 2)


def test_dashboard_billing_drives_the_signed_in_cli(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from starme.higgsfield import HiggsfieldCli, _swapper

    commands: list[list[str]] = []

    def fake_run(cmd: list[str], **_: object) -> SimpleNamespace:
        commands.append(cmd)
        verb = cmd[1:3]
        out: object = {}
        if verb == ["upload", "create"]:
            out = {"id": f"up-{len(commands)}"}
        elif verb == ["generate", "create"]:
            out = ["job-1"]
        elif verb == ["generate", "get"]:
            out = {"status": "completed", "result_url": "https://cdn.example/out.mp4"}
        return SimpleNamespace(returncode=0, stdout=json.dumps(out), stderr="")

    monkeypatch.setattr("starme.higgsfield.subprocess.run", fake_run)
    assert isinstance(_swapper(Settings(), None), HiggsfieldCli)  # dashboard is the default

    cli = HiggsfieldCli()
    job = cli.swap(tmp_path / "v.mp4", [tmp_path / "s.png", tmp_path / "c.png"], "p", "480p")
    url = cli.result_url(job, timeout_seconds=600)

    create = next(c for c in commands if c[1:3] == ["generate", "create"])
    assert create[3] == "hf_mult_replace_object"
    assert create.count("--image") == 2 and create[create.index("--video") + 1] == "up-1"
    assert create[create.index("--resolution") + 1] == "480p"
    assert url == "https://cdn.example/out.mp4"


def test_dashboard_failure_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    from starme.higgsfield import HiggsfieldCli

    def fake_run(cmd: list[str], **_: object) -> SimpleNamespace:
        return SimpleNamespace(returncode=0, stdout=json.dumps({"status": "failed"}), stderr="")

    monkeypatch.setattr("starme.higgsfield.subprocess.run", fake_run)
    with pytest.raises(RuntimeError, match="ended failed"):
        HiggsfieldCli().result_url("job-9", timeout_seconds=60)
