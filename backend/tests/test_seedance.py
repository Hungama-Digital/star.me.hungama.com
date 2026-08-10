import json
from pathlib import Path

import httpx
import pytest

from starme.prompts import subject_replacement_prompt
from starme.seedance import (
    SeedanceClient,
    SeedanceError,
    SeedanceGenerationRequest,
    SeedanceTaskFailed,
    SeedanceTaskTimeout,
)


def request() -> SeedanceGenerationRequest:
    return SeedanceGenerationRequest(
        source_video_url="https://media.example/shot.mp4",
        reference_asset_uris=("asset://subscriber-front", "asset://subscriber-body"),
        prompt=subject_replacement_prompt().text,
    )


def test_payload_uses_video_and_positional_reference_images() -> None:
    payload = request().payload()

    assert payload["generate_audio"] is False
    assert payload["ratio"] == "adaptive"
    assert payload["content"][1] == {
        "type": "video_url",
        "role": "reference_video",
        "video_url": {"url": "https://media.example/shot.mp4"},
    }
    assert [item["image_url"]["url"] for item in payload["content"][2:]] == [
        "asset://subscriber-front",
        "asset://subscriber-body",
    ]


def test_submit_retrieve_wait_download_and_cancel(tmp_path: Path) -> None:
    polls = iter(
        [
            {"id": "task-1", "status": "running"},
            {
                "id": "task-1",
                "status": "succeeded",
                "content": {"video_url": "https://output.example/result.mp4"},
            },
        ]
    )

    def handler(http_request: httpx.Request) -> httpx.Response:
        if http_request.url.host == "output.example":
            assert "Authorization" not in http_request.headers
            return httpx.Response(200, content=b"generated-video")
        assert http_request.headers["Authorization"] == "Bearer test-key"
        if http_request.method == "POST":
            body = json.loads(http_request.content)
            assert body["model"] == "dreamina-seedance-2-0-260128"
            return httpx.Response(200, json={"id": "task-1", "status": "queued"})
        if http_request.method == "DELETE":
            return httpx.Response(204)
        return httpx.Response(200, json=next(polls))

    with SeedanceClient(api_key="test-key", transport=httpx.MockTransport(handler)) as client:
        submitted = client.submit(request())
        assert submitted.status == "queued"
        completed = client.wait("task-1", poll_interval_seconds=0, sleep=lambda _: None)
        assert completed.output_url == "https://output.example/result.mp4"
        destination = client.download(completed.output_url, tmp_path / "result.mp4")
        assert destination.read_bytes() == b"generated-video"
        client.cancel("task-1")


def test_wait_surfaces_provider_failure() -> None:
    transport = httpx.MockTransport(
        lambda _: httpx.Response(
            200,
            json={"id": "task-1", "status": "failed", "error": {"message": "moderated"}},
        )
    )
    with (
        SeedanceClient(api_key="test-key", transport=transport) as client,
        pytest.raises(SeedanceTaskFailed, match="moderated"),
    ):
        client.wait("task-1", poll_interval_seconds=0, sleep=lambda _: None)


def test_wait_times_out() -> None:
    transport = httpx.MockTransport(
        lambda _: httpx.Response(200, json={"id": "task-1", "status": "running"})
    )
    with (
        SeedanceClient(api_key="test-key", transport=transport) as client,
        pytest.raises(SeedanceTaskTimeout),
    ):
        client.wait("task-1", timeout_seconds=0, poll_interval_seconds=0)


def test_http_errors_do_not_expose_credentials() -> None:
    transport = httpx.MockTransport(
        lambda _: httpx.Response(401, json={"error": {"code": "Unauthorized"}})
    )
    with (
        SeedanceClient(api_key="super-secret", transport=transport) as client,
        pytest.raises(SeedanceError, match="Unauthorized") as caught,
    ):
        client.submit(request())
    assert "super-secret" not in str(caught.value)


def test_prompt_variants_are_explicit_and_reject_unknown_names() -> None:
    prompt = subject_replacement_prompt(variant="continuity_lock")
    assert "Do not modify any other face" in prompt.text
    with pytest.raises(ValueError, match="Unknown prompt variant"):
        subject_replacement_prompt(variant="invented")
