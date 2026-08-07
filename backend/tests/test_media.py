from pathlib import Path

from starme.delivery import resolve_media_file


def test_returns_none_when_media_dir_unset(tmp_path: Path) -> None:
    assert resolve_media_file(None, "shells/x/episode-1.mp4") is None


def test_resolves_existing_file(tmp_path: Path) -> None:
    target = tmp_path / "shells" / "ek-love-story-001" / "episode-1.mp4"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"fake mp4")
    resolved = resolve_media_file(str(tmp_path), "shells/ek-love-story-001/episode-1.mp4")
    assert resolved == target.resolve()


def test_missing_file_returns_none(tmp_path: Path) -> None:
    assert resolve_media_file(str(tmp_path), "shells/x/missing.mp4") is None


def test_path_traversal_is_blocked(tmp_path: Path) -> None:
    secret = tmp_path.parent / "secret.env"
    secret.write_text("STARME_OPERATOR_API_KEY=super-secret")
    assert resolve_media_file(str(tmp_path), "../secret.env") is None
    assert resolve_media_file(str(tmp_path), "shells/../../secret.env") is None


def test_absolute_key_does_not_escape_root(tmp_path: Path) -> None:
    assert resolve_media_file(str(tmp_path), "/etc/passwd") is None
