"""GET /v1/app/listing - the App's catalogue screen."""

from __future__ import annotations

from fastapi.testclient import TestClient

from starme.config import get_settings
from starme.listing import APP_LISTING
from starme.main import app

client = TestClient(app)
DEVICE = {"X-Device-Id": "device-listing-0001"}


def cdn():  # noqa: ANN201
    return get_settings().model_copy(
        update={"linode_cdn_base_url": "https://images.hungama.com"}
    )


def listing(headers=DEVICE):  # noqa: ANN001,ANN201
    app.dependency_overrides[get_settings] = cdn
    try:
        return client.get("/v1/app/listing", headers=headers)
    finally:
        app.dependency_overrides.pop(get_settings, None)


def test_listing_returns_every_show_in_authored_order() -> None:
    response = listing()
    assert response.status_code == 200
    body = response.json()
    assert [r["content_id"] for r in body] == [r["content_id"] for r in APP_LISTING]
    assert [r["content_title"] for r in body] == [
        "Ek Love Story Aisi Bhi", "Camouflage", "Echoes of Vengeance"]


def test_every_item_carries_the_full_contract() -> None:
    """The App reads these keys directly, so a missing one is a crash there."""
    expected = {
        "content_id", "shell_id", "content_title", "content_type",
        "content_genre", "actor",
        "age_rating", "audio_language", "release_date", "year_of_release",
        "original_show_name", "artwork", "cast",
    }
    for item in listing().json():
        assert set(item) == expected, item["content_title"]
        assert set(item["artwork"]) == {"landscape", "portrait"}
        assert item["cast"], "cast is never an empty list"
        for member in item["cast"]:
            assert set(member) == {"name", "image"}


def test_artwork_urls_are_absolute_and_under_the_configured_cdn() -> None:
    """Built from the CDN base, not stored absolute, so a staging build cannot
    hand out production links."""
    for item in listing().json():
        for aspect, url in item["artwork"].items():
            assert url.startswith("https://images.hungama.com/starme/app-assets/"), url
            assert f"/{aspect}/" in url, url


def test_release_date_stays_the_authored_string() -> None:
    """Typed as a date it would come back timezone-shifted; the App shows it
    verbatim."""
    dates = {i["content_title"]: i["release_date"] for i in listing().json()}
    assert dates["Ek Love Story Aisi Bhi"] == "2026-09-30"
    assert dates["Camouflage"] == "2026-05-20"
    assert all(isinstance(i["year_of_release"], int) for i in listing().json())


def test_the_listing_needs_no_device_header() -> None:
    """Same catalogue for everyone, so it must not 4xx without a device id."""
    anonymous = listing(headers={})
    assert anonymous.status_code == 200
    assert anonymous.json() == listing().json()


def test_every_shell_id_is_one_the_swap_endpoints_can_actually_use() -> None:
    """The whole point of carrying shell_id here is that the App can paste it
    straight into a batch request. A listing shell_id whose artwork does not
    exist would send the user into a job that fails."""
    import httpx

    seen = set()
    for item in listing().json():
        shell = item["shell_id"]
        assert shell and shell not in seen, f"duplicate or empty shell_id {shell!r}"
        seen.add(shell)
        base = "https://images.hungama.com/starme/app-assets/artwork"
        for url in (f"{base}/{shell}.png", f"{base}/{shell}-landscape.png"):
            head = httpx.head(url, timeout=30, follow_redirects=True)
            assert head.status_code == 200, f"{shell}: {url} -> {head.status_code}"
