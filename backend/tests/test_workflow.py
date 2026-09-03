from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient

from starme.main import app

client = TestClient(app)


def authenticated_headers(tester: str = "tester-1") -> dict[str, str]:
    """The API is open, so this is just the device identifier every call now
    carries. Kept under the same name so the workflow tests read unchanged."""
    return {"X-Device-Id": f"device-{tester}-00000000"}


def create_consent(headers: dict[str, str]) -> str:
    response = client.post(
        "/v1/consents",
        headers=headers,
        json={
            "typed_name": "Synthetic Tester",
            "consent_version": "development-placeholder-v1",
            "checked_likeness": True,
            "checked_revocation": True,
            "signature_attested": True,
        },
    )
    assert response.status_code == 201
    assert response.json()["legal_text_status"] == "pending_final_legal_wording"
    return response.json()["reference"]


def create_order(headers: dict[str, str], consent_reference: str):  # type: ignore[no-untyped-def]
    return client.post(
        "/v1/orders",
        headers=headers,
        json={
            "consent_reference": consent_reference,
            "shell_id": "ek-love-story-001",
            "role_id": "arjun",
            "package_id": "lead-debut-3",
            "face_asset_id": "synthetic-face-fixture",
        },
    )


def test_complete_first_look_approval_and_delivery_flow() -> None:
    headers = authenticated_headers()
    consent_reference = create_consent(headers)
    created = create_order(headers, consent_reference)
    assert created.status_code == 201
    body = created.json()
    assert body["status"] == "AWAITING_FIRST_LOOK"
    assert body["first_look"]["status"] == "PENDING"
    assert body["first_look"]["preview_url"]

    approved = client.post(
        f"/v1/orders/{body['id']}/first-look",
        headers=headers,
        json={"decision": "APPROVE"},
    )
    assert approved.status_code == 200
    ready = approved.json()
    assert ready["status"] == "READY"
    assert len(ready["episodes"]) == 3
    assert [job["kind"] for job in ready["jobs"]] == ["FIRST_LOOK", "FULL_RENDER"]

    stream = urlsplit(ready["episodes"][0]["stream_url"])
    grant = client.get(f"{stream.path}?{stream.query}")
    assert grant.status_code == 204
    assert grant.headers["X-StarME-Synthetic-Media"] == "true"


def test_retake_prevents_full_render() -> None:
    headers = authenticated_headers()
    created = create_order(headers, create_consent(headers)).json()
    retake = client.post(
        f"/v1/orders/{created['id']}/first-look",
        headers=headers,
        json={"decision": "RETAKE"},
    )
    assert retake.status_code == 200
    assert retake.json()["status"] == "RETAKE_REQUIRED"
    assert len(retake.json()["jobs"]) == 1


def test_revocation_cancels_queued_order_and_job(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("starme.api.enqueue_first_look", lambda job_id: None)
    headers = authenticated_headers()
    consent_reference = create_consent(headers)
    created = create_order(headers, consent_reference)
    assert created.json()["status"] == "QUEUED"
    revoked = client.delete(f"/v1/consents/{consent_reference}", headers=headers)
    assert revoked.status_code == 200
    assert revoked.json()["canceled_orders"] == 1
    assert revoked.json()["canceled_jobs"] == 1
    order = client.get(f"/v1/orders/{created.json()['id']}", headers=headers)
    assert order.json()["status"] == "CANCELED"


def test_real_face_asset_is_rejected_while_sensitive_processing_is_disabled() -> None:
    headers = authenticated_headers()
    consent_reference = create_consent(headers)
    response = client.post(
        "/v1/orders",
        headers=headers,
        json={
            "consent_reference": consent_reference,
            "shell_id": "ek-love-story-001",
            "role_id": "arjun",
            "package_id": "lead-debut-3",
            "face_asset_id": "real-upload-reference",
        },
    )
    assert response.status_code == 409
