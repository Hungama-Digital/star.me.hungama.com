"""The App's three calls: upload a selfie, ask for swapped artwork, poll it.

No key and no network. Storage and the HTTP transport are both injectable, so
the success path is exercised against fakes and the "no key configured" path
is exercised for real, because that is what staging looks like until a key is
set and it must fail readably rather than hang the App's polling loop.
"""

from __future__ import annotations

import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from starme import artwork
from starme.artwork import FAILED, QUEUED, SUCCEEDED, run_artwork_swap, slugify
from starme.config import get_settings
from starme.database import get_session
from starme.main import app
from starme.models import AppSelfie, ArtworkSwap

client = TestClient(app)
DEVICE = {"X-Device-Id": "device-artwork-0001"}
OTHER = {"X-Device-Id": "device-someone-else"}
PNG = b"\x89PNG\r\n\x1a\n" + b"fake-pixels" * 8


class FakeStorage:
    """Records what would have been uploaded and hands back a CDN-shaped URL."""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, content: bytes, content_type: str):  # noqa: ANN201
        self.objects[key] = (content, content_type)

        class Stored:
            def __init__(self, key: str) -> None:
                self.key = key
                self.checksum_sha256 = "x" * 64

        return Stored(key)

    def public_url(self, key: str) -> str:
        return f"https://images.hungama.com/{key}"


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> FakeStorage:
    fake = FakeStorage()
    monkeypatch.setattr(artwork, "_storage", lambda settings, storage=None: fake)
    return fake


def upload(name: str = "Amol Dewase", data: bytes = PNG, ctype: str = "image/png",
           headers: dict[str, str] | None = None):  # noqa: ANN201
    return client.post(
        "/v1/app/selfies",
        headers=headers or DEVICE,
        data={"name": name},
        files={"image": ("selfie.png", data, ctype)},
    )


# ── API 1 ─────────────────────────────────────────────────────────────────
def test_selfie_upload_returns_a_public_url_and_records_the_name(storage) -> None:
    response = upload("Amol Dewase")
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Amol Dewase"
    assert body["image_url"].startswith("https://images.hungama.com/starme/app-assets/selfies/")
    assert body["size_bytes"] == len(PNG)
    # the name is in the key, slugified, so the URL never needs escaping
    key = body["image_url"].split("images.hungama.com/")[1]
    assert key.startswith("starme/app-assets/selfies/amol-dewase-")
    assert key.endswith(".png")
    assert storage.objects[key][0] == PNG

    session = next(get_session())
    try:
        row = session.get(AppSelfie, body["selfie_id"])
        assert row is not None
        assert (row.display_name, row.name_slug) == ("Amol Dewase", "amol-dewase")
        assert row.size_bytes == len(PNG)
    finally:
        session.close()


def test_two_users_with_the_same_name_do_not_overwrite_each_other(storage) -> None:
    first = upload("Same Name").json()["image_url"]
    second = upload("Same Name").json()["image_url"]
    assert first != second
    assert len(storage.objects) == 2


def test_selfie_upload_refuses_a_type_it_cannot_serve(storage) -> None:
    response = upload(data=b"GIF89a", ctype="image/gif")
    assert response.status_code == 400
    assert "Unsupported image type" in response.json()["detail"]


def test_selfie_upload_refuses_an_empty_file_and_a_blank_name(storage) -> None:
    assert upload(data=b"").status_code == 400
    assert upload(name="   ").status_code == 400


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("Amol Dewase", "amol-dewase"), ("  Neeraj  Sir ", "neeraj-sir"),
     ("R@hul #1", "r-hul-1"), ("नीरज", "user"), ("", "user")],
)
def test_slugify_always_yields_a_url_safe_name(raw: str, expected: str) -> None:
    assert slugify(raw) == expected


# ── API 2 + API 3 ─────────────────────────────────────────────────────────
def test_submit_returns_a_job_and_polling_reports_a_readable_failure(storage) -> None:
    """With no image-model key the job must fail
    with a reason the App can show, not hang. poll_after_seconds going null is
    the App's signal to stop polling."""
    selfie_id = upload().json()["selfie_id"]
    submitted = client.post(
        "/v1/app/artwork-swaps",
        headers=DEVICE,
        json={"shell_id": "ek-love-story-001", "selfie_id": selfie_id,
              "artwork_url": "https://example.test/art.png"},
    )
    assert submitted.status_code == 202
    body = submitted.json()
    assert body["shell_id"] == "ek-love-story-001"

    polled = client.get(f"/v1/app/artwork-swaps/{body['job_id']}", headers=DEVICE)
    assert polled.status_code == 200
    state = polled.json()
    assert state["status"] == FAILED
    assert "STARME_OPENAI_API_KEY" in state["error"], state["error"]
    assert state["poll_after_seconds"] is None
    assert state["portrait_url"] is None
    assert state["landscape_url"] is None


def test_submit_accepts_a_bare_image_url_without_a_stored_selfie(storage) -> None:
    submitted = client.post(
        "/v1/app/artwork-swaps",
        headers=DEVICE,
        json={"shell_id": "ek-love-story-001",
              "image_url": "https://images.hungama.com/starme/app-assets/selfies/x.png",
              "artwork_url": "https://example.test/art.png"},
    )
    assert submitted.status_code == 202


def test_submit_without_a_selfie_or_url_is_refused(storage) -> None:
    response = client.post(
        "/v1/app/artwork-swaps", headers=DEVICE, json={"shell_id": "ek-love-story-001"}
    )
    assert response.status_code == 400
    assert "selfie_id or image_url" in response.json()["detail"]


def test_a_selfie_from_another_device_cannot_be_used(storage) -> None:
    selfie_id = upload(headers=OTHER).json()["selfie_id"]
    response = client.post(
        "/v1/app/artwork-swaps",
        headers=DEVICE,
        json={"shell_id": "ek-love-story-001", "selfie_id": selfie_id},
    )
    assert response.status_code == 404


def test_another_device_cannot_poll_someone_elses_job(storage) -> None:
    job_id = client.post(
        "/v1/app/artwork-swaps",
        headers=DEVICE,
        json={"shell_id": "ek-love-story-001", "image_url": "https://example.test/a.png",
              "artwork_url": "https://example.test/art.png"},
    ).json()["job_id"]
    assert client.get(f"/v1/app/artwork-swaps/{job_id}", headers=DEVICE).status_code == 200
    assert client.get(f"/v1/app/artwork-swaps/{job_id}", headers=OTHER).status_code == 404


def test_polling_an_unknown_job_is_404(storage) -> None:
    assert client.get("/v1/app/artwork-swaps/nope", headers=DEVICE).status_code == 404


# ── the worker ────────────────────────────────────────────────────────────
def with_key():  # noqa: ANN201
    """Settings with an image-model key, without touching the cached global."""
    return get_settings().model_copy(update={"openai_api_key": SecretStr("test-key")})


#: A minimal real PNG header so read_dimensions can size the output.
PNG_1000x1777 = (
    b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
    + (1000).to_bytes(4, "big") + (1777).to_bytes(4, "big") + b"rest"
)


#: A landscape header, so the worker picks the landscape output size for it.
PNG_1672x941 = (
    b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
    + (1672).to_bytes(4, "big") + (941).to_bytes(4, "big") + b"rest"
)


def _transport(swapped: bytes, captured: dict) -> httpx.MockTransport:
    def handle(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, content=PNG_1000x1777,
                                  headers={"content-type": "image/png"})
        # Three calls now run concurrently, so a single slot records whichever
        # thread happened to finish last. Keep them all.
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = request.content
        captured.setdefault("bodies", []).append(request.content)
        return httpx.Response(
            200, json={"data": [{"b64_json": base64.b64encode(swapped).decode()}]}
        )

    return httpx.MockTransport(handle)


def test_worker_publishes_the_swapped_artwork_and_marks_it_succeeded(storage) -> None:
    settings = with_key()
    session = next(get_session())
    try:
        row = ArtworkSwap(
            tester_reference="device-x", source_image_url="https://example.test/selfie.png",
            shell_id="ek-love-story-001", artwork_url="https://example.test/art.png",
            status="queued",
        )
        session.add(row)
        session.commit()
        swap_id = row.id
        captured: dict = {}
        done = run_artwork_swap(
            session, swap_id, settings=settings,
            transport=_transport(b"swapped-artwork-bytes", captured), storage=storage,
        )
        assert done.status == SUCCEEDED, done.failure_reason
        assert done.failure_reason is None
        assert done.result_url == (
            f"https://images.hungama.com/starme/app-assets/artwork-swaps/{swap_id}.png"
        )
        # no landscape artwork on this row, so that half is simply absent
        assert done.landscape_url is None
        # the character still only needs the portrait artwork, so it is still
        # produced on a row that has no landscape source
        assert done.character_url.endswith(f"{swap_id}-character.png")
        assert storage.objects[done.result_object_key][0] == b"swapped-artwork-bytes"
        assert done.attempt_count == 1
        # artwork first, selfie second: the prompt refers to them by position
        assert captured["url"].endswith("/images/edits")
        assert captured["auth"] == "Bearer test-key"
        assert all(b'name="image[]"' in b for b in captured["bodies"])
        assert all(b"gpt-image-2" in b for b in captured["bodies"])
        # a 1000x1777 artwork is portrait, so the portrait size must be sent
        assert any(b"1024x1536" in b for b in captured["bodies"]), "portrait size"
    finally:
        session.close()


def test_worker_records_a_model_refusal_instead_of_raising(storage) -> None:
    settings = with_key()

    def refuse(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, content=PNG_1000x1777,
                                  headers={"content-type": "image/png"})
        return httpx.Response(400, json={"error": {"message": "content policy"}})

    session = next(get_session())
    try:
        row = ArtworkSwap(
            tester_reference="device-x", source_image_url="https://example.test/selfie.png",
            shell_id="ek-love-story-001", artwork_url="https://example.test/art.png",
            status="queued",
        )
        session.add(row)
        session.commit()
        done = run_artwork_swap(
            session, row.id, settings=settings,
            transport=httpx.MockTransport(refuse), storage=storage,
        )
        assert done.status == FAILED
        assert "content policy" in done.failure_reason
        assert done.completed_at is not None
    finally:
        session.close()


def test_an_unreachable_artwork_fails_the_job_not_the_request(storage) -> None:
    """gpt-image-2 takes bytes, so we fetch the artwork. A 404 on it must land
    on the row as a readable reason, not surface as a request error."""
    settings = with_key()
    session = next(get_session())
    try:
        row = ArtworkSwap(
            tester_reference="device-x", source_image_url="https://example.test/selfie.png",
            shell_id="missing-series", artwork_url="https://example.test/absent.png",
            status="queued",
        )
        session.add(row)
        session.commit()
        done = run_artwork_swap(
            session, row.id, settings=settings,
            transport=httpx.MockTransport(
                lambda r: httpx.Response(404) if "absent" in str(r.url)
                else httpx.Response(200, content=PNG_1000x1777,
                                    headers={"content-type": "image/png"})
            ),
            storage=storage,
        )
        # the selfie fetched fine, so this is a per-aspect failure with no
        # portrait produced - hence FAILED overall, naming the artwork
        assert done.status == FAILED
        assert "absent.png" in done.failure_reason
    finally:
        session.close()


def test_the_three_calls_are_open_and_need_no_token(storage) -> None:
    """Same contract as the rest of the API after the token removal: a device
    header, no Authorization, and no 401 anywhere."""
    assert upload(headers={"X-Device-Id": "device-open-1"}).status_code == 201
    assert client.post(
        "/v1/app/artwork-swaps",
        headers={"X-Device-Id": "device-open-1"},
        json={"shell_id": "ek-love-story-001", "image_url": "https://example.test/a.png",
              "artwork_url": "https://example.test/art.png"},
    ).status_code == 202
    assert json.loads(client.get("/v1/catalogue/shells").text) is not None


def test_submitting_without_a_locatable_artwork_is_refused(storage) -> None:
    """No CDN base and no explicit artwork_url means the artwork cannot be
    found. That must be a 400 at submit, not a job that fails minutes later."""
    response = client.post(
        "/v1/app/artwork-swaps",
        headers=DEVICE,
        json={"shell_id": "ek-love-story-001", "image_url": "https://example.test/s.png"},
    )
    assert response.status_code == 400
    assert "artwork_url" in response.json()["detail"]

@pytest.mark.parametrize(
    ("width", "height", "expected"),
    [(1000, 1777, "1024x1536"), (1672, 941, "1536x1024"), (2048, 2048, "1024x1024"),
     (0, 0, "1024x1536")],
)
def test_output_shape_follows_the_artwork(width, height, expected) -> None:
    """Asked for no size, gpt-image-2 returns a square and re-crops portrait
    key art, so the artwork's own aspect always picks one of its three sizes."""
    from starme.artwork import openai_size

    assert openai_size(width, height) == expected

# ── both aspects from one job ─────────────────────────────────────────────
def test_one_job_returns_portrait_and_landscape(storage) -> None:
    """The App shows the key art in a portrait slot and a landscape slot, so a
    single submit has to produce both rather than make it run two jobs."""
    settings = with_key()
    calls: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            wide = "landscape" in str(request.url)
            raw = PNG_1672x941 if wide else PNG_1000x1777
            return httpx.Response(200, content=raw, headers={"content-type": "image/png"})
        body = request.content
        calls.append(next(size for size in ("1536x1024", "1024x1536", "1024x1024")
                          if size.encode() in body))
        blob = base64.b64encode(b"art-" + str(len(calls)).encode()).decode()
        return httpx.Response(200, json={"data": [{"b64_json": blob}]})

    session = next(get_session())
    try:
        row = ArtworkSwap(
            tester_reference="device-x", source_image_url="https://example.test/selfie.png",
            shell_id="ek-love-story-001",
            artwork_url="https://example.test/art.png",
            landscape_artwork_url="https://example.test/art-landscape.png",
            status="queued",
        )
        session.add(row)
        session.commit()
        swap_id = row.id
        done = run_artwork_swap(
            session, swap_id, settings=settings,
            transport=httpx.MockTransport(handle), storage=storage,
        )
        assert done.status == SUCCEEDED, done.failure_reason
        assert done.failure_reason is None
        assert done.result_url.endswith(f"{swap_id}.png")
        assert done.landscape_url.endswith(f"{swap_id}-landscape.png")
        assert done.character_url.endswith(f"{swap_id}-character.png")
        # three outputs, each asking for its own shape: portrait, landscape,
        # and the square single-character still
        assert sorted(calls) == ["1024x1024", "1024x1536", "1536x1024"]
        assert len({done.result_object_key, done.landscape_object_key,
                    done.character_object_key}) == 3
    finally:
        session.close()


def test_a_missing_landscape_still_succeeds_and_says_so(storage) -> None:
    """A shell with only portrait key art must not fail the whole job - the
    portrait is the primary output and one usable image beats none."""
    settings = with_key()

    def handle(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            if "landscape" in str(request.url):
                return httpx.Response(404)
            return httpx.Response(200, content=PNG_1000x1777,
                                  headers={"content-type": "image/png"})
        return httpx.Response(
            200, json={"data": [{"b64_json": base64.b64encode(b"portrait-only").decode()}]}
        )

    session = next(get_session())
    try:
        row = ArtworkSwap(
            tester_reference="device-x", source_image_url="https://example.test/selfie.png",
            shell_id="no-landscape-shell",
            artwork_url="https://example.test/art.png",
            landscape_artwork_url="https://example.test/art-landscape.png",
            status="queued",
        )
        session.add(row)
        session.commit()
        done = run_artwork_swap(
            session, row.id, settings=settings,
            transport=httpx.MockTransport(handle), storage=storage,
        )
        assert done.status == SUCCEEDED
        assert done.result_url is not None
        assert done.landscape_url is None
        # the App must be told why the URL is null rather than left guessing
        assert "landscape" in done.failure_reason
    finally:
        session.close()


def test_submit_derives_both_conventional_artwork_paths() -> None:
    from starme.artwork import artwork_urls_for

    settings = get_settings().model_copy(
        update={"linode_cdn_base_url": "https://images.hungama.com"}
    )
    portrait, landscape = artwork_urls_for("ek-love-story-001", settings)
    assert portrait.endswith("/artwork/ek-love-story-001.png")
    assert landscape.endswith("/artwork/ek-love-story-001-landscape.png")


# ── API 2b / 3b: one selfie, several series ───────────────────────────────
BATCH = {"X-Device-Id": "device-batch-0001"}


@pytest.fixture
def cdn():  # noqa: ANN201
    """A CDN base, so a bare shell_id can be resolved to its artwork paths.

    The batch call takes no artwork_url override - one URL cannot serve N
    series - so unlike the single-shell tests it needs a real base configured.
    """
    settings = get_settings().model_copy(
        update={"linode_cdn_base_url": "https://images.hungama.com"}
    )
    app.dependency_overrides[get_settings] = lambda: settings
    yield settings
    app.dependency_overrides.pop(get_settings, None)


def batch(shell_ids, selfie_id=None, headers=BATCH, **extra):  # noqa: ANN001,ANN201
    payload = {"shell_ids": shell_ids, **extra}
    if selfie_id:
        payload["selfie_id"] = selfie_id
    return client.post("/v1/app/artwork-swaps/batch", headers=headers, json=payload)


def test_a_batch_creates_one_job_per_series_in_the_order_asked(storage, cdn) -> None:
    selfie = upload(headers=BATCH).json()["selfie_id"]
    response = batch(["camouflage-001", "echoes-of-vengeance-001", "amar-sundari-001"], selfie)
    assert response.status_code == 202, response.text
    body = response.json()
    assert [j["shell_id"] for j in body["jobs"]] == [
        "camouflage-001", "echoes-of-vengeance-001", "amar-sundari-001"]
    assert len({j["job_id"] for j in body["jobs"]}) == 3
    assert body["skipped"] == {}


def test_each_job_resolves_its_own_series_artwork(storage, cdn) -> None:
    """The whole point of a batch: every series gets ITS poster, not the first
    series' poster reused."""
    selfie = upload(headers=BATCH).json()["selfie_id"]
    ids = [j["job_id"] for j in batch(["camouflage-001", "amar-sundari-001"], selfie).json()["jobs"]]
    session = next(get_session())
    try:
        rows = {r.id: r for r in (session.get(ArtworkSwap, i) for i in ids)}
        art = {rows[i].shell_id: rows[i].artwork_url for i in ids}
    finally:
        session.close()
    assert art["camouflage-001"].endswith("/camouflage-001.png")
    assert art["amar-sundari-001"].endswith("/amar-sundari-001.png")
    assert art["camouflage-001"] != art["amar-sundari-001"]


def test_a_repeated_series_is_collapsed_rather_than_billed_twice(storage, cdn) -> None:
    selfie = upload(headers=BATCH).json()["selfie_id"]
    body = batch(["camouflage-001", "camouflage-001", " camouflage-001 "], selfie).json()
    assert [j["shell_id"] for j in body["jobs"]] == ["camouflage-001"]


def test_a_batch_without_a_selfie_or_url_is_refused(storage, cdn) -> None:
    response = batch(["camouflage-001"])
    assert response.status_code == 400
    assert "selfie_id or image_url" in response.json()["detail"]


def test_a_batch_accepts_a_bare_image_url(storage, cdn) -> None:
    body = batch(["camouflage-001"], image_url="https://example.test/me.png").json()
    assert len(body["jobs"]) == 1


def test_an_empty_shell_list_is_refused_before_anything_is_queued(storage, cdn) -> None:
    selfie = upload(headers=BATCH).json()["selfie_id"]
    assert batch([], selfie).status_code == 422
    assert batch(["  "], selfie).status_code == 400


def test_a_selfie_from_another_device_cannot_seed_a_batch(storage, cdn) -> None:
    mine = upload(headers=BATCH).json()["selfie_id"]
    assert batch(["camouflage-001"], mine, headers=OTHER).status_code == 404


def test_listing_answers_in_the_order_asked(storage, cdn) -> None:
    selfie = upload(headers=BATCH).json()["selfie_id"]
    ids = [j["job_id"] for j in batch(["camouflage-001", "amar-sundari-001"], selfie).json()["jobs"]]
    listed = client.get("/v1/app/artwork-swaps", headers=BATCH,
                        params={"job_ids": ",".join(reversed(ids))})
    assert listed.status_code == 200
    assert [j["job_id"] for j in listed.json()["jobs"]] == list(reversed(ids))


def test_the_list_never_leaks_another_devices_jobs(storage, cdn) -> None:
    selfie = upload(headers=BATCH).json()["selfie_id"]
    mine = batch(["camouflage-001"], selfie).json()["jobs"][0]["job_id"]
    seen = client.get("/v1/app/artwork-swaps", headers=OTHER,
                      params={"job_ids": mine}).json()
    assert seen["jobs"] == []
    assert seen["poll_after_seconds"] is None


def test_the_batch_stop_signal_tracks_the_slowest_job(storage, cdn) -> None:
    """One open job must keep the whole batch polling, or the App stops early
    and never collects the poster that was still rendering."""
    selfie = upload(headers=BATCH).json()["selfie_id"]
    created = batch(["camouflage-001", "amar-sundari-001"], selfie).json()
    ids = [j["job_id"] for j in created["jobs"]]
    # inline queue: both ran and failed on the missing key, so all terminal
    assert created["poll_after_seconds"] is None

    session = next(get_session())
    try:
        session.get(ArtworkSwap, ids[0]).status = QUEUED
        session.commit()
    finally:
        session.close()
    body = client.get("/v1/app/artwork-swaps", headers=BATCH,
                      params={"job_ids": ",".join(ids)}).json()
    assert body["jobs"][0]["poll_after_seconds"] is not None
    assert body["jobs"][1]["poll_after_seconds"] is None
    assert body["poll_after_seconds"] is not None

def test_the_edit_call_sends_the_configured_quality(storage) -> None:
    """Quality is sent explicitly, not left to the provider's default.

    Asserts the CONFIGURED value reaches the wire rather than a hardcoded
    level, so changing the default is a one-line config change and not a test
    edit. The default itself is a measured choice, documented in config.py.
    """
    settings = with_key().model_copy(update={"openai_image_quality": "medium"})
    session = next(get_session())
    try:
        row = ArtworkSwap(
            tester_reference="device-q", source_image_url="https://example.test/selfie.png",
            shell_id="camouflage-001", artwork_url="https://example.test/art.png",
            status="queued",
        )
        session.add(row)
        session.commit()
        captured: dict = {}
        run_artwork_swap(
            session, row.id, settings=settings,
            transport=_transport(PNG_1000x1777, captured), storage=storage,
        )
        field = captured["bodies"][0].split(b'name="quality"')[1][:120]
        assert b"medium" in field, field
        assert b"high" not in field, "the configured value was ignored"
    finally:
        session.close()
