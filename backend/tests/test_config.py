import pytest

from starme.config import Settings


def test_sensitive_features_require_all_three_switches() -> None:
    assert not Settings(allow_sensitive_processing=True).sensitive_features_enabled
    assert not Settings(storage_backend="memory", render_provider="stub").sensitive_features_enabled
    assert Settings(
        allow_sensitive_processing=True,
        storage_backend="memory",
        render_provider="stub",
    ).sensitive_features_enabled


def test_staging_rejects_local_cryptographic_defaults() -> None:
    with pytest.raises(ValueError, match="cryptographic defaults"):
        Settings(
            environment="staging",
            operator_api_key="local-operator-change-me",
            token_hash_pepper="local-token-pepper-change-me",
            delivery_signing_key="local-delivery-key-change-me",
        )


def test_byteplus_configuration_has_safe_non_secret_defaults() -> None:
    settings = Settings(_env_file=None)

    assert settings.byteplus_api_key is None
    assert settings.byteplus_access_key is None
    assert settings.byteplus_secret_key is None
    assert settings.byteplus_model == "dreamina-seedance-2-0-260128"
    assert settings.byteplus_project_name == "default"
