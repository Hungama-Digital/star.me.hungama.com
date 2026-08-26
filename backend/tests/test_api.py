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
    issue = client.post(
        "/v1/operator/access-codes",
        headers={"X-Operator-Key": "test-operator-key"},
        json={"tester_reference": "tester-1"},
    )
    token = client.post(
        "/v1/access/redeem",
        json={"code": issue.json()["code"], "device_id": "device-0001"},
    ).json()["access_token"]
    response = client.get("/v1/catalogue/shells", headers={"Authorization": f"Bearer {token}"})
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


def test_catalogue_requires_authentication() -> None:
    assert client.get("/v1/catalogue/shells").status_code == 401


def _authorized_token(reference: str) -> str:
    issue = client.post(
        "/v1/operator/access-codes",
        headers={"X-Operator-Key": "test-operator-key"},
        json={"tester_reference": reference},
    )
    return client.post(
        "/v1/access/redeem",
        json={"code": issue.json()["code"], "device_id": "device-face-1"},
    ).json()["access_token"]


def test_face_registration_is_refused_until_sensitive_processing_is_enabled() -> None:
    """Both App paths - selfie and gallery pick - hit this one endpoint, and
    neither may send a real face to the provider on an environment that has
    not switched sensitive processing on."""
    token = _authorized_token("tester-face")
    response = client.post(
        "/v1/identity/face-assets",
        headers={"Authorization": f"Bearer {token}"},
        files={"image": ("face.png", b"not-a-real-image", "image/png")},
    )
    assert response.status_code == 409
    assert "Sensitive processing" in response.json()["detail"]


def test_face_registration_requires_authentication() -> None:
    response = client.post(
        "/v1/identity/face-assets",
        files={"image": ("face.png", b"x", "image/png")},
    )
    assert response.status_code in (401, 403)


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
    try:
        register_face_asset(raw=b"not-an-image", tester_reference="keep-me", settings=settings)
    except (ValueError, RuntimeError):
        pass

    assert good.read_bytes() == b"the portrait already working for this device"
    assert not (faces / "keep-me.incoming.png").exists()
