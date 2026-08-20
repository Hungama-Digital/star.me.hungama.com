from collections.abc import Iterator

import pytest

from starme.byteplus_assets import (
    BytePlusAssetClient,
    BytePlusAssetError,
    BytePlusAssetTimeout,
)


class FakeUniversalApi:
    def __init__(self, responses: list[object]) -> None:
        self.responses: Iterator[object] = iter(responses)
        self.calls: list[tuple[str, dict[str, object]]] = []

    def do_call(self, info, body, **kwargs):  # type: ignore[no-untyped-def]
        self.calls.append((info.action, body))
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        return response


def client(api: FakeUniversalApi) -> BytePlusAssetClient:
    return BytePlusAssetClient(access_key="ak", secret_key="sk", api=api)


def test_liveness_session_and_group_result() -> None:
    api = FakeUniversalApi(
        [
            {"BytedToken": "token-1", "H5Link": "https://verify.example"},
            {"GroupId": "group-1"},
        ]
    )
    assets = client(api)

    session = assets.create_liveness_session("https://callback.example")
    group_id = assets.get_liveness_group(session.byted_token)

    assert session.h5_link == "https://verify.example"
    assert group_id == "group-1"
    assert api.calls[0][0] == "CreateVisualValidateSession"
    assert api.calls[0][1]["ProjectName"] == "default"


def test_create_poll_and_delete_asset() -> None:
    api = FakeUniversalApi(
        [
            {"Id": "asset-1"},
            {"Id": "asset-1", "GroupId": "group-1", "Status": "Processing"},
            {
                "Id": "asset-1",
                "GroupId": "group-1",
                "Status": "Active",
                "AssetType": "Image",
            },
            {},
            {},
        ]
    )
    assets = client(api)

    asset_id = assets.create_asset(
        group_id="group-1", source_url="https://media.example/face.jpg", name="front"
    )
    active = assets.wait_for_asset(asset_id, poll_interval_seconds=0, sleep=lambda _: None)
    assets.delete_asset(active.id)
    assets.delete_group(active.group_id)

    assert active.uri == "asset://asset-1"
    assert [call[0] for call in api.calls] == [
        "CreateAsset",
        "GetAsset",
        "GetAsset",
        "DeleteAsset",
        "DeleteAssetGroup",
    ]


def test_failed_and_timed_out_assets_are_reported() -> None:
    failed = client(FakeUniversalApi([{"Id": "asset-1", "Status": "Failed"}]))
    with pytest.raises(BytePlusAssetError, match="preprocessing failed"):
        failed.wait_for_asset("asset-1", poll_interval_seconds=0, sleep=lambda _: None)

    timed_out = client(FakeUniversalApi([{"Id": "asset-1", "Status": "Processing"}]))
    with pytest.raises(BytePlusAssetTimeout):
        timed_out.wait_for_asset("asset-1", timeout_seconds=0, poll_interval_seconds=0)


def test_provider_errors_are_wrapped_without_credentials() -> None:
    assets = client(FakeUniversalApi([RuntimeError("provider detail")]))
    with pytest.raises(BytePlusAssetError, match="ListAssetGroups") as caught:
        assets.list_groups()
    assert "ak" not in str(caught.value)


def test_provider_error_code_is_surfaced_without_full_response() -> None:
    error = RuntimeError("provider response")
    error.body = (  # type: ignore[attr-defined]
        '{"ResponseMetadata":{"Error":{"Code":"SubscriptionRequired","Message":"internal detail"}}}'
    )
    assets = client(FakeUniversalApi([error]))

    with pytest.raises(BytePlusAssetError, match="SubscriptionRequired") as caught:
        assets.create_liveness_session("https://callback.example")

    assert "internal detail" not in str(caught.value)


def test_create_asset_group_returns_aigc_group_id() -> None:
    api = FakeUniversalApi([{"Id": "group-20260819183514-swcdv"}])
    group_id = client(api).create_asset_group("starme-renders")
    assert group_id == "group-20260819183514-swcdv"
    action, body = api.calls[0]
    assert action == "CreateAssetGroup"
    assert body == {"Name": "starme-renders", "ProjectName": "default"}


def test_ensure_active_asset_registers_and_waits() -> None:
    api = FakeUniversalApi(
        [
            {"Id": "asset-9"},
            {"Id": "asset-9", "GroupId": "group-1", "Status": "Processing"},
            {"Id": "asset-9", "GroupId": "group-1", "Status": "Active", "AssetType": "Video"},
        ]
    )
    asset = client(api).ensure_active_asset(
        group_id="group-1",
        source_url="https://media.example/shot.mp4",
        asset_type="Video",
        name="proof-source",
        sleep=lambda _: None,
    )
    assert asset.uri == "asset://asset-9"
    assert api.calls[0][0] == "CreateAsset"
    assert api.calls[0][1]["AssetType"] == "Video"


def test_rejected_asset_fails_closed() -> None:
    api = FakeUniversalApi(
        [
            {"Id": "asset-9"},
            {"Id": "asset-9", "GroupId": "group-1", "Status": "Rejected"},
        ]
    )
    with pytest.raises(BytePlusAssetError, match="rejected"):
        client(api).ensure_active_asset(
            group_id="group-1",
            source_url="https://media.example/face.png",
            sleep=lambda _: None,
        )
