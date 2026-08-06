import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from starme.config import Settings


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
