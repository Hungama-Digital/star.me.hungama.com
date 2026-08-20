from __future__ import annotations

import hashlib
import io
import secrets
from datetime import timedelta
from typing import Any

from minio import Minio

from starme.config import Settings
from starme.providers import StoredObject


class LinodeStorageError(RuntimeError):
    pass


class LinodeObjectStorage:
    """Hosts render inputs on Linode object storage.

    BytePlus CreateAsset copies files from an HTTPS URL, so objects only need
    to exist here transiently. Keys carry a random component because the
    bucket is public; callers should delete objects after asset registration.
    """

    def __init__(
        self,
        *,
        endpoint_url: str,
        bucket: str,
        cdn_base_url: str,
        prefix: str = "starme/renders",
        access_key: str = "",
        secret_key: str = "",
        client: Any | None = None,
    ) -> None:
        if client is None:
            if not access_key or not secret_key:
                raise LinodeStorageError("Linode access key and secret are required")
            client = Minio(
                endpoint_url.removeprefix("https://").removeprefix("http://"),
                access_key=access_key,
                secret_key=secret_key,
                secure=True,
            )
        self._client = client
        self._bucket = bucket
        self._cdn_base_url = cdn_base_url.rstrip("/")
        self._prefix = prefix.strip("/")

    @classmethod
    def from_settings(cls, settings: Settings) -> LinodeObjectStorage | None:
        if not (
            settings.linode_endpoint_url
            and settings.linode_bucket
            and settings.linode_cdn_base_url
            and settings.linode_access_key
            and settings.linode_secret
        ):
            return None
        return cls(
            endpoint_url=settings.linode_endpoint_url,
            bucket=settings.linode_bucket,
            cdn_base_url=settings.linode_cdn_base_url,
            prefix=settings.linode_prefix,
            access_key=settings.linode_access_key.get_secret_value(),
            secret_key=settings.linode_secret.get_secret_value(),
        )

    def object_key(self, name: str) -> str:
        return f"{self._prefix}/{secrets.token_urlsafe(12)}/{name}"

    def put(self, key: str, content: bytes, content_type: str) -> StoredObject:
        self._client.put_object(
            self._bucket,
            key,
            io.BytesIO(content),
            length=len(content),
            content_type=content_type,
        )
        return StoredObject(key=key, checksum_sha256=hashlib.sha256(content).hexdigest())

    def public_url(self, key: str) -> str:
        return f"{self._cdn_base_url}/{key}"

    def signed_read_url(self, key: str, ttl_seconds: int) -> str:
        url = self._client.presigned_get_object(
            self._bucket, key, expires=timedelta(seconds=ttl_seconds)
        )
        return str(url)

    def delete(self, key: str) -> None:
        self._client.remove_object(self._bucket, key)
