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


def test_catalogue_requires_authentication() -> None:
    assert client.get("/v1/catalogue/shells").status_code == 401
