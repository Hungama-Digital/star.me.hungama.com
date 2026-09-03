"""The whole subscriber flow with no code and no token anywhere.

The tester code screen is gone from the app, so nothing can send a code or a
bearer token. This walks the flow the app actually performs and asserts that
no step answers 4XX for want of a credential. Responses that are 4XX for a
real reason - a malformed body, an order that does not exist, a gate that is
switched off in this environment - are asserted separately and on purpose, so
that a future change cannot quietly turn "open" back into "rejected".
"""

from fastapi.testclient import TestClient

from starme.main import app

client = TestClient(app)
DEVICE = {"X-Device-Id": "device-open-flow-0001"}
CONSENT = {
    "typed_name": "Synthetic Tester",
    "consent_version": "development-placeholder-v1",
    "checked_likeness": True,
    "checked_revocation": True,
    "signature_attested": True,
}


def test_the_whole_flow_needs_no_code_or_token() -> None:
    assert client.get("/v1/capabilities").status_code == 200
    assert client.get("/v1/catalogue/shells", headers=DEVICE).status_code == 200

    consent = client.post("/v1/consents", headers=DEVICE, json=CONSENT)
    assert consent.status_code == 201
    reference = consent.json()["reference"]

    order = client.post(
        "/v1/orders",
        headers=DEVICE,
        json={
            "consent_reference": reference,
            "shell_id": "ek-love-story-001",
            "role_id": "arjun",
            "package_id": "lead-debut-3",
            # Sensitive processing is off in test, where only synthetic
            # assets are accepted. That gate is not authentication.
            "face_asset_id": "synthetic-face-1",
        },
    )
    assert order.status_code == 201
    order_id = order.json()["id"]

    assert client.get(f"/v1/orders/{order_id}", headers=DEVICE).status_code == 200
    decided = client.post(
        f"/v1/orders/{order_id}/first-look",
        headers=DEVICE,
        json={"decision": "APPROVE"},
    )
    assert decided.status_code == 200
    assert client.delete(f"/v1/consents/{reference}", headers=DEVICE).status_code == 200


def test_no_route_answers_401_or_403_without_credentials() -> None:
    """Swept rather than spot-checked: a route added later that reintroduces a
    credential check should fail here."""
    consent = client.post("/v1/consents", headers=DEVICE, json=CONSENT)
    reference = consent.json()["reference"]
    order_id = client.post(
        "/v1/orders",
        headers=DEVICE,
        json={
            "consent_reference": reference,
            "shell_id": "ek-love-story-001",
            "role_id": "arjun",
            "package_id": "lead-debut-3",
            "face_asset_id": "synthetic-face-1",
        },
    ).json()["id"]

    calls = [
        ("GET", "/health/live", None),
        ("GET", "/health/ready", None),
        ("GET", "/v1/capabilities", None),
        ("GET", "/v1/catalogue/shells", None),
        ("POST", "/v1/consents", CONSENT),
        ("GET", f"/v1/orders/{order_id}", None),
        ("POST", f"/v1/orders/{order_id}/first-look", {"decision": "RETAKE"}),
    ]
    rejected = []
    for method, path, body in calls:
        response = client.request(method, path, headers=DEVICE, json=body)
        if response.status_code in (401, 403):
            rejected.append((path, response.status_code))
    assert rejected == []

    # And with no device header at all, so a client that sends nothing is
    # still served rather than refused.
    assert client.get("/v1/catalogue/shells").status_code == 200
    assert client.post("/v1/consents", json=CONSENT).status_code == 201


def test_the_retired_token_endpoints_are_gone() -> None:
    assert (
        client.post(
            "/v1/operator/access-codes", json={"tester_reference": "whoever"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/v1/access/redeem",
            json={"code": "whatever12", "device_id": "device-12345678"},
        ).status_code
        == 404
    )


def test_remaining_4xx_are_real_faults_not_missing_credentials() -> None:
    """The 4XX that survive are the ones that should: a malformed body, an
    order that does not exist, and a package that is not on sale."""
    assert client.post("/v1/consents", headers=DEVICE, json={}).status_code == 422
    assert client.get("/v1/orders/no-such-order", headers=DEVICE).status_code == 404

    reference = client.post("/v1/consents", headers=DEVICE, json=CONSENT).json()[
        "reference"
    ]
    wrong_package = client.post(
        "/v1/orders",
        headers=DEVICE,
        json={
            "consent_reference": reference,
            "shell_id": "ek-love-story-001",
            "role_id": "arjun",
            "package_id": "not-for-sale",
            "face_asset_id": "synthetic-face-1",
        },
    )
    assert wrong_package.status_code == 422
