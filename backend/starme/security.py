import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from starme.config import Settings
from starme.models import AccessCode, ClientSession


def utcnow() -> datetime:
    return datetime.now(UTC)


def digest(value: str, pepper: str) -> str:
    return hmac.new(pepper.encode(), value.encode(), hashlib.sha256).hexdigest()


def issue_code(
    session: Session, tester_reference: str, hours: int, settings: Settings
) -> tuple[str, datetime]:
    plaintext = secrets.token_urlsafe(9)
    expires_at = utcnow() + timedelta(hours=hours)
    session.add(
        AccessCode(
            code_digest=digest(plaintext, settings.token_hash_pepper.get_secret_value()),
            tester_reference=tester_reference,
            expires_at=expires_at,
        )
    )
    session.commit()
    return plaintext, expires_at


def redeem_code(
    session: Session, code: str, device_id: str, settings: Settings
) -> tuple[str, datetime]:
    now = utcnow()
    code_row = session.scalar(
        select(AccessCode).where(
            AccessCode.code_digest == digest(code, settings.token_hash_pepper.get_secret_value())
        )
    )
    if (
        code_row is None
        or code_row.consumed_at is not None
        or code_row.revoked_at is not None
        or code_row.expires_at.replace(tzinfo=UTC) <= now
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Access code is invalid or expired")
    device_digest = digest(device_id, settings.token_hash_pepper.get_secret_value())
    token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(hours=12)
    code_row.consumed_at = now
    code_row.device_digest = device_digest
    session.add(
        ClientSession(
            token_digest=digest(token, settings.token_hash_pepper.get_secret_value()),
            tester_reference=code_row.tester_reference,
            device_digest=device_digest,
            expires_at=expires_at,
        )
    )
    session.commit()
    return token, expires_at


def authenticate_token(session: Session, token: str, settings: Settings) -> ClientSession:
    row = session.scalar(
        select(ClientSession).where(
            ClientSession.token_digest
            == digest(token, settings.token_hash_pepper.get_secret_value())
        )
    )
    if row is None or row.revoked_at is not None or row.expires_at.replace(tzinfo=UTC) <= utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session is invalid or expired")
    return row
