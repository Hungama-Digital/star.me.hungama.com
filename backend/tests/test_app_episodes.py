"""GET /v1/app/episodes?shell_id=... - one show's episode list."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from starme.config import get_settings
from starme.listing import APP_LISTING, SHOW_EPISODES
from starme.main import app

client = TestClient(app)
DEVICE = {"X-Device-Id": "device-episodes-0001"}


def cdn():  # noqa: ANN201
    return get_settings().model_copy(
        update={"linode_cdn_base_url": "https://images.hungama.com"}
    )


def episodes(shell_id: str, headers=DEVICE):  # noqa: ANN001,ANN201
    app.dependency_overrides[get_settings] = cdn
    try:
        return client.get("/v1/app/episodes", headers=headers,
                          params={"shell_id": shell_id})
    finally:
        app.dependency_overrides.pop(get_settings, None)


@pytest.mark.parametrize("shell_id", sorted(SHOW_EPISODES))
def test_every_listed_show_answers_with_its_full_run(shell_id: str) -> None:
    body = episodes(shell_id).json()
    assert body["shell_id"] == shell_id
    assert body["total_episodes"] == len(body["episodes"]), "run must match the array"
    assert [e["episode_number"] for e in body["episodes"]] == list(
        range(1, body["total_episodes"] + 1)), "numbered 1..n with no gaps"


def test_content_ids_follow_the_distribution_pattern() -> None:
    """EVN<base>S01E<n>. Built, not hand-listed, so episode 10 is S01E10 and
    not S01E010 or a typo."""
    body = episodes("pehchan-jhoothi-hai-001").json()
    assert body["episodes"][0]["content_id"] == "EVN202638734S01E1"
    assert body["episodes"][9]["content_id"] == "EVN202638734S01E10"
    assert len({e["content_id"] for e in body["episodes"]}) == 10


def test_produced_episodes_carry_a_video_and_the_rest_carry_empty_string() -> None:
    """The unproduced ones are still announced, so the App shows the full run
    with the rest greyed out rather than claiming the show is 3 episodes."""
    body = episodes("pehchan-jhoothi-hai-001").json()
    with_video = [e for e in body["episodes"] if e["video_url"]]
    assert [e["episode_number"] for e in with_video] == [1, 2, 3]
    for e in with_video:
        assert e["video_url"].endswith(f"-ep{e['episode_number']}.mp4")
    for e in body["episodes"][3:]:
        assert e["video_url"] == "", "never null: one string type to bind"


def test_a_show_with_nothing_produced_still_lists_its_run() -> None:
    body = episodes("camouflage-001").json()
    assert body["total_episodes"] == 10
    assert all(e["video_url"] == "" for e in body["episodes"])


def test_show_fields_match_the_listing_row() -> None:
    """One source of truth: the episode screen must not drift from the
    catalogue screen on title, id or artwork."""
    for shell_id in SHOW_EPISODES:
        row = next(r for r in APP_LISTING if r["shell_id"] == shell_id)
        body = episodes(shell_id).json()
        assert body["show_id"] == row["content_id"]
        assert body["show_name"] == row["content_title"]
        assert body["portrait"].endswith(row["portrait"].rsplit("/", 1)[-1])
        assert body["landscape"].endswith(row["landscape"].rsplit("/", 1)[-1])
        for e in body["episodes"]:
            assert e["portrait"] == body["portrait"]
            assert e["landscape"] == body["landscape"]


def test_an_unknown_shell_is_404_not_an_empty_list() -> None:
    """An empty episodes array reads as 'this show has no episodes', which is
    a different thing from 'no such show'."""
    response = episodes("no-such-show-001")
    assert response.status_code == 404
    assert "no-such-show-001" in response.json()["detail"]


def test_shell_id_is_required() -> None:
    assert client.get("/v1/app/episodes", headers=DEVICE).status_code == 422


def test_it_needs_no_device_header() -> None:
    anonymous = episodes("pehchan-jhoothi-hai-001", headers={})
    assert anonymous.status_code == 200
    assert anonymous.json() == episodes("pehchan-jhoothi-hai-001").json()
