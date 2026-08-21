import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from starme.config import Settings
from starme.services import _seedance_order_inputs


def order(
    face: str = "asset://face-1",
    shell_id: str = "ek-love-story-001",
    tester: str = "Amol-RMX3782",
) -> SimpleNamespace:
    return SimpleNamespace(face_asset_id=face, shell_id=shell_id, tester_reference=tester)


def settings(media_dir: str | None, **overrides: object) -> Settings:
    return Settings(
        environment="test",
        media_dir=media_dir,
        render_provider="seedance",
        allow_sensitive_processing=True,
        **overrides,  # type: ignore[arg-type]
    )


def write_manifest(tmp_path: Path) -> None:
    shell_dir = tmp_path / "shells" / "ek-love-story-001"
    shell_dir.mkdir(parents=True)
    (shell_dir / "shot-manifest.json").write_text(
        json.dumps(
            [
                {
                    "episode": 1,
                    "clip": "ep01_arjun_01",
                    "start": 7,
                    "duration": 2,
                    "characters": "Arjun",
                }
            ]
        )
    )


def test_requires_the_sensitive_processing_switch(tmp_path: Path) -> None:
    guarded = Settings(environment="test", media_dir=str(tmp_path), render_provider="seedance")
    with pytest.raises(RuntimeError, match="ALLOW_SENSITIVE_PROCESSING"):
        _seedance_order_inputs(order(), guarded)  # type: ignore[arg-type]


def test_rejects_orders_without_a_registered_face_asset(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="asset:// face reference"):
        _seedance_order_inputs(order(face="synthetic-fixture-1"), settings(str(tmp_path)))  # type: ignore[arg-type]


def test_tester_mapping_bridges_synthetic_orders(tmp_path: Path) -> None:
    write_manifest(tmp_path)
    mapped = settings(str(tmp_path), tester_face_assets={"Amol-RMX3782": "asset://face-amol"})
    shell, media_root, manifest, face_uri = _seedance_order_inputs(
        order(face="synthetic-fixture-1"),
        mapped,  # type: ignore[arg-type]
    )
    assert face_uri == "asset://face-amol"
    assert shell.role_character == "Arjun"
    # An order-level asset:// still wins over the mapping.
    _, _, _, direct = _seedance_order_inputs(order(), mapped)  # type: ignore[arg-type]
    assert direct == "asset://face-1"


def test_requires_media_dir_and_manifest(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="STARME_MEDIA_DIR"):
        _seedance_order_inputs(order(), settings(None))  # type: ignore[arg-type]
    with pytest.raises(RuntimeError, match="Shot manifest is missing"):
        _seedance_order_inputs(order(), settings(str(tmp_path)))  # type: ignore[arg-type]


def test_rejects_unknown_shell(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="role metadata"):
        _seedance_order_inputs(order(shell_id="unknown-shell"), settings(str(tmp_path)))  # type: ignore[arg-type]


def test_returns_shell_manifest_and_face_when_preconditions_hold(tmp_path: Path) -> None:
    write_manifest(tmp_path)
    shell, media_root, manifest, face_uri = _seedance_order_inputs(
        order(),
        settings(str(tmp_path)),  # type: ignore[arg-type]
    )
    assert shell.role_character == "Arjun"
    assert media_root == tmp_path
    assert manifest[0].clip == "ep01_arjun_01"
    assert face_uri == "asset://face-1"
