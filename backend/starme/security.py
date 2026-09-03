import hashlib
import hmac
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from starme.config import Settings
from starme.models import ClientSession


def utcnow() -> datetime:
    return datetime.now(UTC)


def digest(value: str, pepper: str) -> str:
    return hmac.new(pepper.encode(), value.encode(), hashlib.sha256).hexdigest()


#: Identity used when an open call carries no device header at all.
OPEN_ACCESS_TESTER = "open-access"


def open_client(
    session: Session, device_id: str | None, settings: Settings
) -> ClientSession:
    """Identity for a caller that presents no token.

    The tester code screen was removed from the app, so nothing can obtain a
    bearer token any more and every call arrived tokenless - 401 on consent,
    orders and face assets. Access is therefore no longer authenticated.

    The returned row is deliberately NOT added to the session: there is no
    token to store, so there is no session to persist. Only
    `tester_reference` is read downstream.

    Identity still has to be per device. Filing every caller under one shared
    reference is how a shared staging code once collapsed several testers into
    a single consent/order owner, which made active consent unusable and mixed
    different testers' projects - so the device decides. A device that
    redeemed a code before keeps the reference its existing consent and orders
    are already filed under, so nothing it created becomes unreachable.
    """
    if not device_id:
        return ClientSession(
            tester_reference=OPEN_ACCESS_TESTER, device_digest="", expires_at=utcnow()
        )
    device_digest = digest(device_id, settings.token_hash_pepper.get_secret_value())
    prior = session.scalar(
        select(ClientSession)
        .where(
            ClientSession.device_digest == device_digest,
            ClientSession.tester_reference != OPEN_ACCESS_TESTER,
        )
        .order_by(ClientSession.created_at.desc())
    )
    tester_reference = (
        prior.tester_reference
        if prior is not None
        else f"open-device-{device_digest[:16]}"
    )
    return ClientSession(
        tester_reference=tester_reference,
        device_digest=device_digest,
        expires_at=utcnow(),
    )
