import pytest
from fastapi.testclient import TestClient

from starme.config import get_settings
from starme.database import SessionLocal
from starme.main import app
from starme.models import OpsUser
from starme.ops_auth import hash_password
from tests.test_workflow import authenticated_headers, create_consent, create_order

client = TestClient(app)
OFFICE = {"X-Real-IP": "10.0.0.1"}
PASSWORD = "correct horse battery"


def member(email: str, role: str) -> None:
    with SessionLocal() as session:
        session.add(
            OpsUser(email=email, name=email, role=role, password_hash=hash_password(PASSWORD))
        )
        session.commit()


def sign_in(email: str, password: str = PASSWORD) -> int:
    client.cookies.clear()
    return client.post(
        "/ops/api/login", headers=OFFICE, json={"email": email, "password": password}
    ).status_code


@pytest.fixture(autouse=True)
def reviewer() -> None:
    member("qc@hungama.com", "reviewer")
    assert sign_in("qc@hungama.com") == 200


@pytest.fixture
def qc_gate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "video_qc_gate", True)


def rendered_order(headers: dict[str, str]) -> str:
    order = create_order(headers, create_consent(headers)).json()
    approved = client.post(
        f"/v1/orders/{order['id']}/first-look", headers=headers, json={"decision": "APPROVE"}
    )
    assert approved.status_code == 200
    return order["id"]


def test_ops_is_invisible_outside_the_office_network() -> None:
    assert client.get("/ops").status_code == 404
    assert client.get("/ops/api/overview", headers={"X-Real-IP": "203.0.113.9"}).status_code == 404
    assert client.get("/ops/api/overview", headers={"X-Real-IP": "not-an-ip"}).status_code == 404
    assert client.get("/ops", headers=OFFICE).status_code == 200
    for path in ["overview?days=7", "entries", "pipeline"]:
        assert client.get(f"/ops/api/{path}", headers=OFFICE).status_code == 200


@pytest.mark.usefixtures("qc_gate")
def test_finished_video_waits_for_qc_then_releases() -> None:
    headers = authenticated_headers()
    order_id = rendered_order(headers)

    # The App keeps seeing a render in progress, with no episode links.
    held = client.get(f"/v1/orders/{order_id}", headers=headers).json()
    assert held["status"] == "FULL_RENDERING"
    assert held["episodes"] == []

    queue = client.get("/ops/api/entries?kind=video&status=AWAITING_QC", headers=OFFICE).json()
    assert [row["id"] for row in queue["rows"]] == [order_id]
    assert queue["rows"][0]["name"] == "Synthetic Tester"
    assert len(client.get(f"/ops/api/video/{order_id}", headers=OFFICE).json()["episodes"]) == 3

    approved = client.post(
        f"/ops/api/video/{order_id}/qc", headers=OFFICE, json={"decision": "approve"}
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "READY"
    assert "order.qc_approved" in [a["type"] for a in approved.json()["audit"]]

    released = client.get(f"/v1/orders/{order_id}", headers=headers).json()
    assert released["status"] == "READY"
    assert len(released["episodes"]) == 3

    again = client.post(
        f"/ops/api/video/{order_id}/qc", headers=OFFICE, json={"decision": "approve"}
    )
    assert again.status_code == 409


@pytest.mark.usefixtures("qc_gate")
def test_redo_renders_again_and_reject_fails_the_order() -> None:
    headers = authenticated_headers()
    order_id = rendered_order(headers)

    redo = client.post(
        f"/ops/api/video/{order_id}/qc",
        headers=OFFICE,
        json={"decision": "redo", "note": "earring"},
    ).json()
    # Inline queue: the re-render ran straight away and is back in QC, not doubled up.
    assert redo["status"] == "AWAITING_QC"
    assert len(redo["episodes"]) == 3
    assert [j["kind"] for j in redo["jobs"]] == ["FIRST_LOOK", "FULL_RENDER", "FULL_RENDER"]

    rejected = client.post(
        f"/ops/api/video/{order_id}/qc", headers=OFFICE, json={"decision": "reject", "note": "x"}
    ).json()
    assert rejected["status"] == "FAILED"
    assert client.get(f"/v1/orders/{order_id}", headers=headers).json()["status"] == "FAILED"


def test_data_needs_a_signed_in_member() -> None:
    client.post("/ops/api/logout", headers=OFFICE)
    assert client.get("/ops", headers=OFFICE).status_code == 200  # the sign-in page itself
    assert client.get("/ops/api/entries", headers=OFFICE).status_code == 401
    assert client.get("/ops/api/me", headers=OFFICE).status_code == 401
    assert sign_in("qc@hungama.com", "wrong password") == 401
    assert sign_in("nobody@hungama.com") == 401
    assert sign_in("qc@hungama.com") == 200
    assert client.get("/ops/api/me", headers=OFFICE).json()["role"] == "reviewer"


def test_five_wrong_passwords_lock_the_account() -> None:
    for _ in range(5):
        assert sign_in("qc@hungama.com", "wrong password") == 401
    assert sign_in("qc@hungama.com") == 429


@pytest.mark.usefixtures("qc_gate")
def test_viewer_can_look_but_not_decide() -> None:
    order_id = rendered_order(authenticated_headers())
    member("view@hungama.com", "viewer")
    assert sign_in("view@hungama.com") == 200
    assert client.get(f"/ops/api/video/{order_id}", headers=OFFICE).status_code == 200
    decision = client.post(
        f"/ops/api/video/{order_id}/qc", headers=OFFICE, json={"decision": "approve"}
    )
    assert decision.status_code == 403
    assert client.get("/ops/api/team", headers=OFFICE).status_code == 403


def test_admin_adds_a_member_who_signs_in_with_the_temporary_password() -> None:
    member("admin@hungama.com", "admin")
    assert sign_in("admin@hungama.com") == 200
    added = client.post(
        "/ops/api/team",
        headers=OFFICE,
        json={"email": "New@Hungama.com", "name": "New", "role": "viewer"},
    ).json()
    assert added["email"] == "new@hungama.com"
    assert sign_in("new@hungama.com", added["temporary_password"]) == 200
    changed = client.post(
        "/ops/api/password",
        headers=OFFICE,
        json={"current": added["temporary_password"], "new": "a much better password"},
    )
    assert changed.status_code == 200
    assert sign_in("new@hungama.com", "a much better password") == 200
