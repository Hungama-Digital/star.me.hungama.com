from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="STARME_",
        env_ignore_empty=True,
        extra="ignore",
    )

    environment: Literal["local", "test", "staging", "production"] = "local"
    log_level: str = "INFO"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    database_url: str = "sqlite+pysqlite:///:memory:"
    redis_url: str = "redis://127.0.0.1:6379/0"
    queue_backend: Literal["inline", "rq"] = "inline"
    storage_backend: Literal["disabled", "memory", "s3"] = "disabled"
    render_provider: Literal["disabled", "stub", "cineiq"] = "disabled"
    signed_url_ttl_seconds: int = Field(default=900, ge=60, le=3600)
    download_url_ttl_seconds: int = Field(default=1800, ge=60, le=3600)
    allow_sensitive_processing: bool = False
    operator_api_key: SecretStr = SecretStr("local-operator-change-me")
    token_hash_pepper: SecretStr = SecretStr("local-token-pepper-change-me")
    delivery_signing_key: SecretStr = SecretStr("local-delivery-key-change-me")
    public_api_base_url: str = "http://127.0.0.1:8000"
    approved_consent_version: str | None = None
    # Seedance generation uses the ModelArk API key. The private real-human asset
    # library is a separate API surface authenticated with an Access Key pair.
    byteplus_api_key: SecretStr | None = None
    byteplus_model: str = "dreamina-seedance-2-0-260128"
    byteplus_api_base_url: str = "https://ark.ap-southeast.bytepluses.com/api/v3"
    byteplus_project_name: str = "default"
    byteplus_access_key: SecretStr | None = None
    byteplus_secret_key: SecretStr | None = None
    byteplus_poll_interval_seconds: float = Field(default=5, ge=1, le=60)
    byteplus_task_timeout_seconds: int = Field(default=900, ge=60, le=3600)
    render_work_dir: str = "tmp/renders"
    # Optional local media root. When set, /v1/media serves real shell files from here
    # (passthrough demo delivery); episodes/first-look map to shells/{shell_id}/... keys.
    # This is NOT the real render pipeline and does not enable sensitive processing.
    media_dir: str | None = None

    @model_validator(mode="after")
    def reject_local_secrets_outside_development(self) -> "Settings":
        if self.environment in {"staging", "production"}:
            values = {
                self.operator_api_key.get_secret_value(),
                self.token_hash_pepper.get_secret_value(),
                self.delivery_signing_key.get_secret_value(),
            }
            if any(value.startswith("local-") for value in values):
                raise ValueError("Replace all local cryptographic defaults before deployment")
        return self

    @property
    def sensitive_features_enabled(self) -> bool:
        return (
            self.allow_sensitive_processing
            and self.storage_backend != "disabled"
            and self.render_provider != "disabled"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
