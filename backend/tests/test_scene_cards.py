"""Per-poster scene cards reaching the image model."""

from __future__ import annotations

import base64

import httpx
import pytest
from pydantic import SecretStr

from starme import artwork
from starme.artwork import SUCCEEDED, run_artwork_swap
from starme.config import get_settings
from starme.database import get_session
from starme.models import ArtworkSwap
from starme.scene_cards import SCENE_CARDS, character_prompt, swap_prompt

PNG = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
       + (1000).to_bytes(4, "big") + (1777).to_bytes(4, "big") + b"rest")


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


@pytest.mark.parametrize("shell_id", sorted(SCENE_CARDS))
def test_each_card_states_light_colour_style_detail_and_expression(shell_id):
    """The five things the product review said were missing. A card that
    omits one silently reintroduces the symptom it was written to fix."""
    p = swap_prompt(shell_id)
    for required in ("Lighting:", "Colour:", "Style and texture:",
                     "Detail:", "Expression and pose:"):
        assert required in p, f"{shell_id} card has no {required}"
    assert "ONLY the identity" in p
    assert "Not sharper." in p
    assert "Avoid:" in p


@pytest.mark.parametrize("shell_id", sorted(SCENE_CARDS))
def test_no_card_tells_the_model_to_render_the_face_at_high_detail(shell_id):
    """The old global prompt did, and that instruction IS the "face is
    sharper than everything around it" complaint."""
    assert "high detail" not in swap_prompt(shell_id)
    assert "high detail" not in character_prompt(shell_id)


def test_a_shell_without_a_card_falls_back_rather_than_failing():
    assert swap_prompt("brand-new-show-001") is None
    assert character_prompt("brand-new-show-001") is None


def test_the_cards_are_not_interchangeable():
    """Each must describe its own poster. Copy-paste between shows is the
    likeliest way this data rots."""
    lights = {s: SCENE_CARDS[s]["light"] for s in SCENE_CARDS}
    assert len(set(lights.values())) == len(lights), "two shows share a light"
    assert "painted" in SCENE_CARDS["ek-love-story-001"]["style"]
    assert "photographic" in SCENE_CARDS["camouflage-001"]["style"]


def _transport(captured: dict) -> httpx.MockTransport:
    def handle(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, content=PNG,
                                  headers={"content-type": "image/png"})
        captured.setdefault("bodies", []).append(request.content)
        return httpx.Response(
            200, json={"data": [{"b64_json": base64.b64encode(PNG).decode()}]})
    return httpx.MockTransport(handle)


def test_the_card_actually_reaches_the_model_for_a_shell_that_has_one(storage):
    settings = get_settings().model_copy(
        update={"openai_api_key": SecretStr("test-key")})
    session = next(get_session())
    try:
        row = ArtworkSwap(
            tester_reference="device-card", shell_id="camouflage-001",
            source_image_url="https://example.test/s.png",
            artwork_url="https://example.test/a.png", status="queued",
        )
        session.add(row)
        session.commit()
        captured: dict = {}
        done = run_artwork_swap(session, row.id, settings=settings,
                                transport=_transport(captured), storage=storage)
        assert done.status == SUCCEEDED, done.failure_reason
        joined = b"".join(captured["bodies"])
        assert b"black leather jacket" in joined, "Camouflage's own card"
        assert b"denim jacket" not in joined, "another show's card leaked in"
        assert b"Render the face at high detail" not in joined
    finally:
        session.close()


@pytest.mark.parametrize("shell_id", sorted(SCENE_CARDS))
def test_identity_is_stated_as_the_hard_constraint(shell_id):
    """Without this the integration instructions win outright and the face
    stops being the user's. Measured: the first cards scored +0.468 on the Ek
    Love Story landscape; adding this took it to a mean of +0.836."""
    for p in (swap_prompt(shell_id), character_prompt(shell_id)):
        assert "IDENTITY IS THE PRIORITY" in p
        assert "favour recognisability over the effect" in p


@pytest.mark.parametrize("shell_id", sorted(SCENE_CARDS))
def test_no_card_pushes_the_face_into_shadow(shell_id):
    """A face of ~155px has nothing left to recognise once it is half in
    shadow, and the wide posters are exactly where that happens."""
    light = SCENE_CARDS[shell_id]["light"].lower()
    for banned in ("no frontal fill", "no flat frontal fill", "deep warm shadow"):
        assert banned not in light, f"{shell_id}: {banned!r} eats the face"
    assert "readable" in light, f"{shell_id} must keep the features readable"
