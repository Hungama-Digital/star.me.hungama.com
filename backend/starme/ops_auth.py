"""Sign-in for the Ops CMS: team accounts, cookie sessions, roles.

Roles: admin (everything, manages the team), reviewer (QC decisions and
artwork takedown), viewer (read only). Passwords are scrypt-hashed with the
standard library; sessions are random tokens stored only as a SHA-256 digest.

First admin, from the server (password read from stdin, never echoed):
    docker exec -i starme-api-1 python -m starme.ops_auth create-admin EMAIL "NAME" < pwfile
"""

import base64
import hashlib
import hmac
import secrets
import sys
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from starme.config import Settings, get_settings
from starme.database import get_session
from starme.models import OpsSession, OpsUser
from starme.services import audit

COOKIE = "starme_ops"
SESSION_TTL = timedelta(hours=12)
MAX_FAILURES = 5
LOCKOUT = timedelta(minutes=15)
MIN_PASSWORD = 10
Role = Literal["admin", "reviewer", "viewer"]


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(key).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, key = stored.split("$")
        got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=2**14, r=8, p=1)
        return hmac.compare_digest(got, base64.b64decode(key))
    except ValueError:
        return False


# Spent on unknown emails too, so response time does not reveal who has an account.
_DUMMY = hash_password(secrets.token_urlsafe(16))


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def current_user(
    session: Annotated[Session, Depends(get_session)],
    token: Annotated[str | None, Cookie(alias=COOKIE)] = None,
) -> OpsUser:
    if token:
        row = session.scalar(select(OpsSession).where(OpsSession.token_digest == _digest(token)))
        if row and _aware(row.expires_at) > datetime.now(UTC) and row.user.disabled_at is None:
            return row.user
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in required")


UserDep = Annotated[OpsUser, Depends(current_user)]


def require(*roles: Role):  # type: ignore[no-untyped-def]
    def check(user: UserDep) -> OpsUser:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role cannot do this")
        return user

    return Depends(check)


def _me(user: OpsUser) -> dict[str, str]:
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}


router = APIRouter(prefix="/api")
AdminDep = Annotated[OpsUser, require("admin")]
SessionDep = Annotated[Session, Depends(get_session)]


class Login(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)


@router.post("/login")
def login(
    body: Login,
    response: Response,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    now = datetime.now(UTC)
    user = session.scalar(select(OpsUser).where(OpsUser.email == body.email.strip().lower()))
    if user and user.locked_until and _aware(user.locked_until) > now:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try in 15 min.")
    ok = verify_password(body.password, user.password_hash if user else _DUMMY)
    if not user or not ok or user.disabled_at is not None:
        if user:
            user.failed_logins += 1
            if user.failed_logins >= MAX_FAILURES:
                user.locked_until, user.failed_logins = now + LOCKOUT, 0
                audit(session, "ops.login_locked", user.email, "ops_user", user.id)
            session.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    user.failed_logins, user.locked_until = 0, None
    token = secrets.token_urlsafe(32)
    session.add(
        OpsSession(token_digest=_digest(token), user_id=user.id, expires_at=now + SESSION_TTL)
    )
    audit(session, "ops.login", user.email, "ops_user", user.id)
    session.commit()
    response.set_cookie(
        COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        path="/ops",
        httponly=True,
        samesite="strict",
        secure=settings.environment not in {"local", "test"},
    )
    return _me(user)


@router.post("/logout")
def logout(
    response: Response,
    session: SessionDep,
    token: Annotated[str | None, Cookie(alias=COOKIE)] = None,
) -> dict[str, bool]:
    if token:
        row = session.scalar(select(OpsSession).where(OpsSession.token_digest == _digest(token)))
        if row:
            session.delete(row)
            session.commit()
    response.delete_cookie(COOKIE, path="/ops")
    return {"ok": True}


@router.get("/me")
def me(user: UserDep) -> dict[str, str]:
    return _me(user)


class PasswordChange(BaseModel):
    current: str = Field(max_length=200)
    new: str = Field(min_length=MIN_PASSWORD, max_length=200)


@router.post("/password")
def change_password(body: PasswordChange, user: UserDep, session: SessionDep) -> dict[str, bool]:
    if not verify_password(body.current, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is wrong")
    user.password_hash = hash_password(body.new)
    audit(session, "ops.password_changed", user.email, "ops_user", user.id)
    session.commit()
    return {"ok": True}


# ── Team (admins only) ──────────────────────────────────────────────────


def _member(u: OpsUser) -> dict[str, object]:
    return {**_me(u), "disabled": u.disabled_at is not None, "created_at": u.created_at.isoformat()}


@router.get("/team", dependencies=[require("admin")])
def team(session: SessionDep) -> list[dict[str, object]]:
    return [_member(u) for u in session.scalars(select(OpsUser).order_by(OpsUser.created_at))]


class NewMember(BaseModel):
    email: str = Field(min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+$")
    name: str = Field(min_length=1, max_length=100)
    role: Role


@router.post("/team")
def add_member(body: NewMember, session: SessionDep, admin: AdminDep) -> dict[str, object]:
    email = body.email.strip().lower()
    if session.scalar(select(OpsUser).where(OpsUser.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "That email already has an account")
    # Shown once to the admin, who passes it on; the member changes it after signing in.
    temp = secrets.token_urlsafe(12)
    user = OpsUser(
        email=email, name=body.name.strip(), role=body.role, password_hash=hash_password(temp)
    )
    session.add(user)
    session.flush()
    audit(session, "ops.member_added", admin.email, "ops_user", user.id, {"role": body.role})
    session.commit()
    return {**_member(user), "temporary_password": temp}


class MemberChange(BaseModel):
    role: Role | None = None
    disabled: bool | None = None
    reset_password: bool = False


@router.post("/team/{user_id}")
def change_member(
    user_id: str, body: MemberChange, session: SessionDep, admin: AdminDep
) -> dict[str, object]:
    user = session.get(OpsUser, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such member")
    if user.id == admin.id and (body.disabled or (body.role and body.role != "admin")):
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own admin access")
    out: dict[str, object] = {}
    if body.role:
        user.role = body.role
    if body.disabled is not None:
        user.disabled_at = datetime.now(UTC) if body.disabled else None
    if body.disabled or body.reset_password:
        for s in session.scalars(select(OpsSession).where(OpsSession.user_id == user.id)):
            session.delete(s)
    if body.reset_password:
        temp = secrets.token_urlsafe(12)
        user.password_hash, user.failed_logins, user.locked_until = hash_password(temp), 0, None
        out["temporary_password"] = temp
    audit(session, "ops.member_changed", admin.email, "ops_user", user.id, body.model_dump())
    session.commit()
    return {**_member(user), **out}


def _cli() -> None:
    """create-admin EMAIL NAME, password on stdin (min 10 characters)."""
    from starme.database import SessionLocal

    if len(sys.argv) != 4 or sys.argv[1] != "create-admin":
        sys.exit('usage: python -m starme.ops_auth create-admin EMAIL "NAME" < password-file')
    password = sys.stdin.readline().strip()
    if len(password) < MIN_PASSWORD:
        sys.exit(f"password on stdin must be at least {MIN_PASSWORD} characters")
    email = sys.argv[2].strip().lower()
    with SessionLocal() as session:
        user = session.scalar(select(OpsUser).where(OpsUser.email == email))
        if user is None:
            user = OpsUser(email=email, name=sys.argv[3], role="admin", password_hash="")
            session.add(user)
        user.role, user.password_hash, user.disabled_at = "admin", hash_password(password), None
        session.commit()
    print(f"admin ready: {email}")


if __name__ == "__main__":
    _cli()
