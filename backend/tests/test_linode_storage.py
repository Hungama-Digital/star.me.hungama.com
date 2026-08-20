import hashlib
from datetime import timedelta

from pydantic import SecretStr

from starme.config import Settings
from starme.linode_storage import LinodeObjectStorage


class FakeMinio:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.removed: list[str] = []

    def put_object(self, bucket, key, stream, length, content_type):  # type: ignore[no-untyped-def]
        data = stream.read()
        assert len(data) == length
        assert content_type
        self.objects[(bucket, key)] = data

    def presigned_get_object(self, bucket, key, expires):  # type: ignore[no-untyped-def]
        assert isinstance(expires, timedelta)
        return f"https://signed.example/{bucket}/{key}"

    def remove_object(self, bucket, key):  # type: ignore[no-untyped-def]
        self.removed.append(key)


def storage(fake: FakeMinio) -> LinodeObjectStorage:
    return LinodeObjectStorage(
        endpoint_url="https://in-bom-1.linodeobjects.com",
        bucket="contentpublic",
        cdn_base_url="https://images.hungama.com/",
        prefix="starme/renders",
        client=fake,
    )


def test_put_stores_bytes_and_reports_checksum() -> None:
    fake = FakeMinio()
    stored = storage(fake).put("starme/renders/x/a.mp4", b"bytes", "video/mp4")
    assert fake.objects[("contentpublic", "starme/renders/x/a.mp4")] == b"bytes"
    assert stored.checksum_sha256 == hashlib.sha256(b"bytes").hexdigest()


def test_keys_are_prefixed_and_unguessable_and_urls_join_cleanly() -> None:
    st = storage(FakeMinio())
    key = st.object_key("shot.mp4")
    assert key.startswith("starme/renders/") and key.endswith("/shot.mp4")
    assert len(key.split("/")) == 4  # prefix(2) + random + name
    assert st.public_url(key) == f"https://images.hungama.com/{key}"
    assert st.signed_read_url(key, 900).startswith("https://signed.example/")


def test_delete_removes_object() -> None:
    fake = FakeMinio()
    st = storage(fake)
    st.delete("starme/renders/x/a.mp4")
    assert fake.removed == ["starme/renders/x/a.mp4"]


def test_from_settings_requires_complete_configuration() -> None:
    assert LinodeObjectStorage.from_settings(Settings(environment="test")) is None
    configured = Settings(
        environment="test",
        linode_endpoint_url="https://in-bom-1.linodeobjects.com",
        linode_bucket="contentpublic",
        linode_cdn_base_url="https://images.hungama.com",
        linode_access_key=SecretStr("ak"),
        linode_secret=SecretStr("sk"),
    )
    assert LinodeObjectStorage.from_settings(configured) is not None
