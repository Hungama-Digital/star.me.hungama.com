from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from byteplussdkcore import (  # type: ignore[import-untyped]
    ApiClient,
    Configuration,
    UniversalApi,
    UniversalInfo,
)


class BytePlusAssetError(RuntimeError):
    pass


class BytePlusAssetTimeout(BytePlusAssetError):
    pass


@dataclass(frozen=True)
class LivenessSession:
    byted_token: str
    h5_link: str
    callback_url: str


@dataclass(frozen=True)
class PortraitAsset:
    id: str
    group_id: str
    status: str
    asset_type: str
    url: str | None = None

    @property
    def uri(self) -> str:
        return f"asset://{self.id}"


class BytePlusAssetClient:
    def __init__(
        self,
        *,
        access_key: str,
        secret_key: str,
        region: str = "ap-southeast-1",
        project_name: str = "default",
        api: Any | None = None,
    ) -> None:
        if not access_key or not secret_key:
            raise ValueError("BytePlus Access Key and Secret Key are required")
        self.project_name = project_name
        if api is None:
            configuration = Configuration()
            configuration.ak = access_key
            configuration.sk = secret_key
            configuration.region = region
            configuration.debug = False
            api = UniversalApi(ApiClient(configuration))
        self._api = api

    def create_liveness_session(self, callback_url: str) -> LivenessSession:
        result = self._call(
            "CreateVisualValidateSession",
            {"CallbackURL": callback_url, "ProjectName": self.project_name},
        )
        token = str(result.get("BytedToken") or "")
        link = str(result.get("H5Link") or "")
        if not token or not link:
            raise BytePlusAssetError("Liveness response omitted BytedToken or H5Link")
        return LivenessSession(
            byted_token=token,
            h5_link=link,
            callback_url=str(result.get("CallbackURL") or callback_url),
        )

    def get_liveness_group(self, byted_token: str) -> str:
        result = self._call(
            "GetVisualValidateResult",
            {"BytedToken": byted_token, "ProjectName": self.project_name},
        )
        group_id = str(result.get("GroupId") or "")
        if not group_id:
            raise BytePlusAssetError("Liveness has not produced an asset group")
        return group_id

    def list_groups(self, *, page_size: int = 10) -> list[dict[str, Any]]:
        result = self._call(
            "ListAssetGroups",
            {
                "Filter": {"GroupType": "LivenessFace"},
                "PageNumber": 1,
                "PageSize": page_size,
            },
        )
        items = result.get("Items") or []
        return [item for item in items if isinstance(item, dict)]

    def create_asset(
        self,
        *,
        group_id: str,
        source_url: str,
        asset_type: str = "Image",
        name: str | None = None,
    ) -> str:
        body: dict[str, Any] = {
            "GroupId": group_id,
            "URL": source_url,
            "AssetType": asset_type,
            "ProjectName": self.project_name,
        }
        if name:
            body["Name"] = name
        result = self._call("CreateAsset", body)
        asset_id = str(result.get("Id") or "")
        if not asset_id:
            raise BytePlusAssetError("CreateAsset response omitted asset ID")
        return asset_id

    def get_asset(self, asset_id: str) -> PortraitAsset:
        result = self._call("GetAsset", {"Id": asset_id, "ProjectName": self.project_name})
        return PortraitAsset(
            id=str(result.get("Id") or asset_id),
            group_id=str(result.get("GroupId") or ""),
            status=str(result.get("Status") or "Unknown"),
            asset_type=str(result.get("AssetType") or "Unknown"),
            url=result.get("URL"),
        )

    def wait_for_asset(
        self,
        asset_id: str,
        *,
        timeout_seconds: float = 600,
        poll_interval_seconds: float = 5,
        sleep: Callable[[float], None] = time.sleep,
    ) -> PortraitAsset:
        deadline = time.monotonic() + timeout_seconds
        while True:
            asset = self.get_asset(asset_id)
            if asset.status == "Active":
                return asset
            if asset.status == "Failed":
                raise BytePlusAssetError(f"Asset {asset_id} preprocessing failed")
            if time.monotonic() >= deadline:
                raise BytePlusAssetTimeout(f"Asset {asset_id} did not become Active")
            sleep(poll_interval_seconds)

    def delete_asset(self, asset_id: str) -> None:
        self._call("DeleteAsset", {"Id": asset_id, "ProjectName": self.project_name})

    def delete_group(self, group_id: str) -> None:
        self._call("DeleteAssetGroup", {"Id": group_id, "ProjectName": self.project_name})

    def _call(self, action: str, body: dict[str, Any]) -> dict[str, Any]:
        try:
            result = self._api.do_call(
                UniversalInfo(
                    method="POST",
                    service="ark",
                    version="2024-01-01",
                    action=action,
                    content_type="application/json",
                ),
                body,
                _request_timeout=(10, 30),
            )
        except Exception as exc:
            code = self._provider_error_code(exc)
            suffix = f": {code}" if code else ""
            raise BytePlusAssetError(f"BytePlus asset action {action} failed{suffix}") from exc
        if not isinstance(result, dict):
            raise BytePlusAssetError(f"BytePlus asset action {action} returned invalid data")
        return result

    @staticmethod
    def _provider_error_code(exc: Exception) -> str | None:
        body = getattr(exc, "body", None)
        if not isinstance(body, str):
            return None
        try:
            data = json.loads(body)
            code = data["ResponseMetadata"]["Error"]["Code"]
        except (KeyError, TypeError, ValueError):
            return None
        return str(code)
