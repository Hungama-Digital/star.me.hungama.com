from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


class SeedanceError(RuntimeError):
    pass


class SeedanceTaskFailed(SeedanceError):
    pass


class SeedanceTaskTimeout(SeedanceError):
    pass


@dataclass(frozen=True)
class SeedanceGenerationRequest:
    source_video_url: str
    reference_asset_uris: tuple[str, ...]
    prompt: str
    model: str = "dreamina-seedance-2-0-260128"
    ratio: str = "adaptive"
    duration: int | None = None
    generate_audio: bool = False
    watermark: bool = True
    #: Whether this request must carry a reference face. True for every swap:
    #: a swap with no reference silently returns the original footage, and the
    #: guard is what stops that reaching a subscriber as a finished episode.
    #:
    #: False for exactly one caller - the masked pipeline's stage 1, which
    #: paints the lead's head white and needs no face to do it. That stage was
    #: refused outright until this existed, so the masked path had never once
    #: reached the provider (found 2 Sep 2026, after it was reported working).
    #: Deliberately not inferred from an empty tuple: an empty tuple is far
    #: more often a caller that forgot the face than one that means it.
    reference_required: bool = True

    def payload(self) -> dict[str, Any]:
        if self.reference_required and not self.reference_asset_uris:
            raise ValueError("At least one trusted reference asset URI is required")
        content: list[dict[str, Any]] = [
            {"type": "text", "text": self.prompt},
            {
                "type": "video_url",
                "role": "reference_video",
                "video_url": {"url": self.source_video_url},
            },
        ]
        content.extend(
            {
                "type": "image_url",
                "role": "reference_image",
                "image_url": {"url": uri},
            }
            for uri in self.reference_asset_uris
        )
        payload: dict[str, Any] = {
            "model": self.model,
            "content": content,
            "generate_audio": self.generate_audio,
            "ratio": self.ratio,
            "watermark": self.watermark,
        }
        if self.duration is not None:
            payload["duration"] = self.duration
        return payload


@dataclass(frozen=True)
class SeedanceTask:
    id: str
    status: str
    output_url: str | None = None
    error_message: str | None = None


class SeedanceClient:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://ark.ap-southeast.bytepluses.com/api/v3",
        timeout_seconds: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("BytePlus API key is required")
        self._timeout_seconds = timeout_seconds
        self._transport = transport
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout_seconds,
            transport=transport,
        )

    def __enter__(self) -> SeedanceClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def submit(self, request: SeedanceGenerationRequest) -> SeedanceTask:
        response = self._client.post("/contents/generations/tasks", json=request.payload())
        data = self._json_or_raise(response)
        return self._task(data)

    def retrieve(self, task_id: str) -> SeedanceTask:
        response = self._client.get(f"/contents/generations/tasks/{task_id}")
        return self._task(self._json_or_raise(response))

    def cancel(self, task_id: str) -> None:
        response = self._client.delete(f"/contents/generations/tasks/{task_id}")
        if response.status_code not in {200, 204}:
            self._raise_response(response)

    def wait(
        self,
        task_id: str,
        *,
        timeout_seconds: float = 900,
        poll_interval_seconds: float = 5,
        sleep: Callable[[float], None] = time.sleep,
    ) -> SeedanceTask:
        deadline = time.monotonic() + timeout_seconds
        while True:
            task = self.retrieve(task_id)
            normalized = task.status.lower()
            if normalized in {"succeeded", "success", "completed", "complete"}:
                if not task.output_url:
                    raise SeedanceTaskFailed(f"Task {task_id} completed without an output URL")
                return task
            if normalized in {"failed", "error", "cancelled", "canceled", "expired"}:
                raise SeedanceTaskFailed(task.error_message or f"Task {task_id}: {task.status}")
            if time.monotonic() >= deadline:
                raise SeedanceTaskTimeout(f"Task {task_id} exceeded {timeout_seconds:g} seconds")
            sleep(poll_interval_seconds)

    def download(self, output_url: str, destination: Path) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp = destination.with_suffix(destination.suffix + ".partial")
        try:
            # Output URLs commonly point at provider object storage. A separate client prevents
            # the ModelArk bearer credential from being forwarded to that different host.
            with (
                httpx.Client(
                    timeout=self._timeout_seconds, transport=self._transport
                ) as download_client,
                download_client.stream("GET", output_url) as response,
            ):
                if response.status_code != 200:
                    self._raise_response(response)
                with temp.open("wb") as handle:
                    for chunk in response.iter_bytes():
                        handle.write(chunk)
            temp.replace(destination)
        finally:
            temp.unlink(missing_ok=True)
        return destination

    @staticmethod
    def _task(data: dict[str, Any]) -> SeedanceTask:
        content = data.get("content") or {}
        if not isinstance(content, dict):
            content = {}
        error = data.get("error") or {}
        if not isinstance(error, dict):
            error = {}
        task_id = str(data.get("id") or data.get("task_id") or "")
        if not task_id:
            raise SeedanceError("BytePlus response did not include a task ID")
        return SeedanceTask(
            id=task_id,
            status=str(data.get("status") or "unknown"),
            output_url=content.get("video_url") or data.get("video_url") or data.get("output_url"),
            error_message=error.get("message") or data.get("message"),
        )

    @classmethod
    def _json_or_raise(cls, response: httpx.Response) -> dict[str, Any]:
        if not response.is_success:
            cls._raise_response(response)
        try:
            data = response.json()
        except ValueError as exc:
            raise SeedanceError("BytePlus returned a non-JSON response") from exc
        if not isinstance(data, dict):
            raise SeedanceError("BytePlus returned an unexpected response shape")
        return data

    @staticmethod
    def _raise_response(response: httpx.Response) -> None:
        message = f"BytePlus request failed with HTTP {response.status_code}"
        try:
            error = response.json().get("error", {})
            detail = error.get("message") or error.get("code")
            if detail:
                message = f"{message}: {detail}"
        except (ValueError, AttributeError):
            pass
        raise SeedanceError(message)
