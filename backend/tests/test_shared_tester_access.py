from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from starme.config import Settings
from starme.database import SessionLocal
from starme.security import authenticate_token, issue_code, redeem_code


def shared_settings(expires_at: datetime) -> Settings:
    return Settings(
        environment="test",
        database_url="sqlite+pysqlite:///:memory:",
        operator_api_key="test-operator-key",
        token_hash_pepper="test-token-pepper",
        delivery_signing_key="test-delivery-key",
        shared_tester_code="u47ATgHLGyRB",
        shared_tester_code_expires_at=expires_at,
    )


def test_shared_staging_code_is_reusable_across_devices_until_cutoff() -> None:
    cutoff = datetime.now(UTC) + timedelta(days=7)
    settings = shared_settings(cutoff)
    with SessionLocal() as session:
        token_a, expiry_a = redeem_code(session, "u47ATgHLGyRB", "device-amol-0001", settings)
        token_b, expiry_b = redeem_code(session, "u47ATgHLGyRB", "device-neeraj-01", settings)
        assert token_a != token_b
        assert expiry_a == cutoff
        assert expiry_b == cutoff
        client_a = authenticate_token(session, token_a, settings)
        client_b = authenticate_token(session, token_b, settings)
        assert client_a.tester_reference.startswith("shared-device-")
        assert client_b.tester_reference.startswith("shared-device-")
        assert client_a.tester_reference != client_b.tester_reference


def test_shared_code_preserves_existing_device_identity() -> None:
    cutoff = datetime.now(UTC) + timedelta(days=7)
    settings = shared_settings(cutoff)
    with SessionLocal() as session:
        ordinary_code, _ = issue_code(session, "Amol-RMX3782", 24, settings)
        redeem_code(session, ordinary_code, "device-amol-0001", settings)
        shared_token, _ = redeem_code(
            session,
            "u47ATgHLGyRB",
            "device-amol-0001",
            settings,
        )
        client = authenticate_token(session, shared_token, settings)
        assert client.tester_reference == "Amol-RMX3782"


def test_shared_code_fails_closed_after_cutoff() -> None:
    settings = shared_settings(datetime.now(UTC) - timedelta(seconds=1))
    with SessionLocal() as session, pytest.raises(HTTPException) as caught:
        redeem_code(session, "u47ATgHLGyRB", "device-amol-0001", settings)
    assert caught.value.status_code == 401


def test_shared_code_cannot_be_enabled_in_production() -> None:
    with pytest.raises(ValueError, match="forbidden in production"):
        Settings(
            environment="production",
            operator_api_key="secure-operator-key",
            token_hash_pepper="secure-token-pepper",
            delivery_signing_key="secure-delivery-key",
            shared_tester_code="u47ATgHLGyRB",
            shared_tester_code_expires_at=datetime.now(UTC) + timedelta(days=7),
        )
