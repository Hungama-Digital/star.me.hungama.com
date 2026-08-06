from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class StoredObject:
    key: str
    checksum_sha256: str


class ObjectStorage(Protocol):
    def put(self, key: str, content: bytes, content_type: str) -> StoredObject: ...

    def signed_read_url(self, key: str, ttl_seconds: int) -> str: ...


@dataclass(frozen=True)
class RenderRequest:
    job_reference: str
    shell_reference: str
    role_reference: str
    input_object_key: str


class RenderProvider(Protocol):
    def submit(self, request: RenderRequest) -> str: ...

    def cancel(self, provider_job_reference: str) -> None: ...


class DisabledProviderError(RuntimeError):
    pass


class DisabledObjectStorage:
    def put(self, key: str, content: bytes, content_type: str) -> StoredObject:
        raise DisabledProviderError("Protected object storage is not configured")

    def signed_read_url(self, key: str, ttl_seconds: int) -> str:
        raise DisabledProviderError("Protected object storage is not configured")


class DisabledRenderProvider:
    def submit(self, request: RenderRequest) -> str:
        raise DisabledProviderError("A Director-approved render provider is not configured")

    def cancel(self, provider_job_reference: str) -> None:
        raise DisabledProviderError("A Director-approved render provider is not configured")
