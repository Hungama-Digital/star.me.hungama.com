import pytest
from fastapi.testclient import TestClient

from starme.config import get_settings
from starme.main import app
from tests.test_workflow import authenticated_headers, create_consent, create_order

client = TestClient(app)
OFFICE = {"X-Real-IP": "10.0.0.1"}


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
