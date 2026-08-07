import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import quote

from starme.config import Settings


def resolve_media_file(media_dir: str | None, key: str) -> Path | None:
    """Safely resolve a delivery key to a real file under media_dir.

    Returns the path only when media_dir is configured, the resolved path stays
    inside media_dir (no traversal), and the file exists. Otherwise None, so the
    caller falls back to the synthetic 204 contract.
    """
    if not media_dir:
        return None
    root = Path(media_dir).resolve()
    candidate = (root / key.lstrip("/")).resolve()
    if root != candidate and root not in candidate.parents:
        return None
    if candidate.is_file():
        return candidate
    return None


def signed_url(key: str, purpose: str, ttl_seconds: int, settings: Settings) -> str:
    expires = int((datetime.now(UTC) + timedelta(seconds=ttl_seconds)).timestamp())
    message = f"{purpose}:{key}:{expires}"
    signature = hmac.new(
        settings.delivery_signing_key.get_secret_value().encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()
    return (
        f"{settings.public_api_base_url}/v1/media/{quote(key, safe='/')}"
        f"?purpose={purpose}&expires={expires}&signature={signature}"
    )
