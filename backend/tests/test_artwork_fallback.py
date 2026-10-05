"""Seedream fallback when gpt-image-2 cannot serve."""

from __future__ import annotations

import base64

import httpx
import pytest
from pydantic import SecretStr

from starme import artwork
from starme.artwork import FAILED, SUCCEEDED, run_artwork_swap
from starme.config import get_settings
from starme.database import get_session
from starme.models import ArtworkSwap

PNG = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
       + (1000).to_bytes(4, "big") + (1777).to_bytes(4, "big") + b"rest")

QUOTA = {"error": {"message": "You have no credits remaining.",
                   "type": "insufficient_quota",
                   "code": "credit_balance_exhausted"}}


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict = {}

    def put(self, key, content, content_type):  # noqa: ANN001,ANN201
        self.objects[key] = (content, content_type)

        class S:
            def __init__(self, k): self.key, self.checksum_sha256 = k, "x" * 64
        return S(key)

    def public_url(self, key: str) -> str:
        return f"https://images.hungama.com/{key}"


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> FakeStorage:
    fake = FakeStorage()
    monkeypatch.setattr(artwork, "_storage", lambda settings, storage=None: fake)
    return fake


def settings_with(byteplus: bool):  # noqa: ANN201
    update = {"openai_api_key": SecretStr("test-key")}
    update["byteplus_api_key"] = SecretStr("bp-key") if byteplus else None
    return get_settings().model_copy(update=update)


def transport(openai_status: int, seedream_status: int = 200, log=None):  # noqa: ANN001,ANN201
    """OpenAI fails with openai_status; Seedream answers seedream_status."""
    def handle(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if request.method == "GET":
            return httpx.Response(200, content=PNG,
                                  headers={"content-type": "image/png"})
        if "/images/generations" in url:          # Seedream
            if log is not None:
                log.append(("seedream", request.content))
            if seedream_status >= 400:
                return httpx.Response(seedream_status, json={"error": "nope"})
            return httpx.Response(200, json={"data": [
                {"b64_json": base64.b64encode(b"seedream-bytes" + PNG).decode()}]})
        if log is not None:                        # OpenAI
            log.append(("openai", request.content))
        if openai_status >= 400:
            return httpx.Response(openai_status, json=QUOTA)
        return httpx.Response(200, json={"data": [
            {"b64_json": base64.b64encode(PNG).decode()}]})
    return httpx.MockTransport(handle)


def queued(session, shell_id="camouflage-001"):  # noqa: ANN001,ANN201
    row = ArtworkSwap(
        tester_reference="device-fb", shell_id=shell_id,
        source_image_url="https://example.test/s.png",
        artwork_url="https://example.test/a.png", status="queued",
    )
    session.add(row)
    session.commit()
    return row.id


def test_a_quota_error_falls_back_and_the_job_still_succeeds(storage) -> None:
    """The whole point: a user whose swap coincides with an empty balance
    still gets their poster."""
    session = next(get_session())
    try:
        log: list = []
        done = run_artwork_swap(session, queued(session),
                                settings=settings_with(True),
                                transport=transport(429, log=log), storage=storage)
        assert done.status == SUCCEEDED, done.failure_reason
        assert done.result_url, "no portrait produced"
        assert any(who == "seedream" for who, _ in log), "fallback never called"
        assert storage.objects[done.result_object_key][0].startswith(b"seedream-bytes")
    finally:
        session.close()


def test_the_fallback_carries_the_shows_own_scene_card(storage) -> None:
    """Falling back must not quietly drop to a generic prompt, or the image
    arrives in a different style from its siblings."""
    session = next(get_session())
    try:
        log: list = []
        run_artwork_swap(session, queued(session), settings=settings_with(True),
                         transport=transport(429, log=log), storage=storage)
        sent = b"".join(body for who, body in log if who == "seedream")
        assert b"black leather jacket" in sent, "Camouflage's card did not reach it"
        assert b"IDENTITY IS THE PRIORITY" in sent
    finally:
        session.close()


def test_no_fallback_key_means_the_original_error_is_reported(storage) -> None:
    """Silently succeeding is worse than failing when there is no fallback:
    the real cause has to reach the error field."""
    session = next(get_session())
    try:
        done = run_artwork_swap(session, queued(session),
                                settings=settings_with(False),
                                transport=transport(429), storage=storage)
        assert done.status == FAILED
        assert "429" in done.failure_reason
    finally:
        session.close()


def test_both_providers_failing_reports_the_fallbacks_error(storage) -> None:
    session = next(get_session())
    try:
        done = run_artwork_swap(session, queued(session),
                                settings=settings_with(True),
                                transport=transport(429, seedream_status=500),
                                storage=storage)
        assert done.status == FAILED
        assert "Fallback model returned HTTP 500" in done.failure_reason
    finally:
        session.close()


def test_the_fallback_is_not_used_when_the_primary_works(storage) -> None:
    """A provider switch changes the output's size and style, so it must not
    happen on a healthy call."""
    session = next(get_session())
    try:
        log: list = []
        done = run_artwork_swap(session, queued(session),
                                settings=settings_with(True),
                                transport=transport(200, log=log), storage=storage)
        assert done.status == SUCCEEDED
        assert not any(who == "seedream" for who, _ in log), "fallback used needlessly"
    finally:
        session.close()
