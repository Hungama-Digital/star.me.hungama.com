import contextlib

from fastapi.testclient import TestClient

from starme.main import app

client = TestClient(app)


def test_liveness() -> None:
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["environment"] == "test"


def test_byteplus_liveness_callback_does_not_echo_token() -> None:
    response = client.get(
        "/v1/byteplus/liveness/callback",
        params={"resultCode": "10000", "bytedToken": "sensitive-token"},
    )

    assert response.status_code == 200
    assert "Verification complete" in response.text
    assert "sensitive-token" not in response.text


def test_readiness_with_local_database() -> None:
    response = client.get("/health/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_sensitive_capabilities_are_disabled_by_default() -> None:
    response = client.get("/v1/capabilities")
    assert response.status_code == 200
    body = response.json()
    assert body["catalogue"] is True
    assert body["identity_capture"] is False
    assert body["consent_collection"] is True
    assert body["rendering"] is False
    assert "real sensitive processing remains disabled" in body["reason"]


def test_catalogue_contains_only_marked_synthetic_fixtures() -> None:
    response = client.get("/v1/catalogue/shells", headers={"X-Device-Id": "device-0001"})
    assert response.status_code == 200
    shells = response.json()
    assert len(shells) == 1
    assert shells[0]["id"] == "ek-love-story-001"
    assert shells[0]["enabled_role"] == "arjun"
    assert all(shell["synthetic_fixture"] is True for shell in shells)


def test_capabilities_publish_server_consent_configuration() -> None:
    response = client.get("/v1/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert payload["consent_version"] is None
    assert payload["legal_text_status"] == "pending_final_legal_wording"


def test_catalogue_is_open_without_a_token() -> None:
    """The API is open. The app's tester code screen was removed, so nothing
    can obtain a bearer token any more and a tokenless call must not 401."""
    response = client.get("/v1/catalogue/shells")
    assert response.status_code == 200
    assert [shell["id"] for shell in response.json()] == ["ek-love-story-001"]


def test_open_calls_are_separated_by_device() -> None:
    """Two devices with no token must not share one identity: filing every
    caller under a single reference is what once made one tester's consent and
    orders visible to another."""
    from starme.api import current_client
    from starme.config import get_settings
    from starme.database import get_session

    settings = get_settings()
    session = next(get_session())
    try:
        a = current_client(session, settings, x_device_id="device-aaa")
        b = current_client(session, settings, x_device_id="device-bbb")
        anon = current_client(session, settings, x_device_id=None)
        assert a.tester_reference != b.tester_reference
        assert a.tester_reference == current_client(
            session, settings, x_device_id="device-aaa"
        ).tester_reference
        assert anon.tester_reference == "open-access"
    finally:
        session.close()


def test_a_device_with_a_pre_existing_session_keeps_that_identity() -> None:
    """Consent and orders created before this change are filed under the
    reference a redeemed code issued. Those client_sessions rows are still in
    the database, so an open call from the same device must resolve to the old
    reference - otherwise everything that device already created is orphaned."""
    from starme.api import current_client
    from starme.config import get_settings
    from starme.database import get_session
    from starme.models import ClientSession
    from starme.security import digest, utcnow

    settings = get_settings()
    session = next(get_session())
    try:
        device_id = "device-legacy-1"
        session.add(
            ClientSession(
                token_digest="legacy-token-digest",
                tester_reference="tester-legacy",
                device_digest=digest(
                    device_id, settings.token_hash_pepper.get_secret_value()
                ),
                expires_at=utcnow(),
            )
        )
        session.commit()
        resolved = current_client(session, settings, x_device_id=device_id)
        assert resolved.tester_reference == "tester-legacy"
    finally:
        session.close()


def test_face_registration_is_refused_until_sensitive_processing_is_enabled() -> None:
    """Both App paths - selfie and gallery pick - hit this one endpoint, and
    neither may send a real face to the provider on an environment that has
    not switched sensitive processing on."""
    response = client.post(
        "/v1/identity/face-assets",
        headers={"X-Device-Id": "device-face-1"},
        files={"image": ("face.png", b"not-a-real-image", "image/png")},
    )
    assert response.status_code == 409
    assert "Sensitive processing" in response.json()["detail"]


def test_face_registration_is_open_but_still_gated_on_consent() -> None:
    """Removing the token requirement must not open a hole in the gates that
    are not about authentication. A tokenless upload gets past auth and is
    then refused by the sensitive-processing/consent gate, not by a 401."""
    response = client.post(
        "/v1/identity/face-assets",
        files={"image": ("face.png", b"x", "image/png")},
    )
    assert response.status_code == 409
    assert "Sensitive processing" in response.json()["detail"]


def test_a_failed_registration_keeps_the_previous_portrait(tmp_path) -> None:
    """A second photo that cannot be used must not take down the one already
    working for this device. Found by refusing a faceless photo under a
    reference that already had a good portrait: the good one went with it,
    which silently breaks the render that reads it."""
    from starme.config import Settings
    from starme.services import register_face_asset

    faces = tmp_path / "faces"
    faces.mkdir()
    good = faces / "keep-me.png"
    good.write_bytes(b"the portrait already working for this device")

    settings = Settings(faces_dir=str(faces), face_qa_enabled=True)
    # No storage or provider configured, so registration fails before any
    # promotion - exactly the window where the old file used to be lost.
    with contextlib.suppress(ValueError, RuntimeError):
        register_face_asset(raw=b"not-an-image", tester_reference="keep-me", settings=settings)

    assert good.read_bytes() == b"the portrait already working for this device"
    assert not (faces / "keep-me.incoming.png").exists()
