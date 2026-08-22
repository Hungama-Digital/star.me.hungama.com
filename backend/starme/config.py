from datetime import datetime
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
    render_provider: Literal["disabled", "stub", "cineiq", "seedance"] = "disabled"
    signed_url_ttl_seconds: int = Field(default=900, ge=60, le=3600)
    download_url_ttl_seconds: int = Field(default=1800, ge=60, le=3600)
    allow_sensitive_processing: bool = False
    operator_api_key: SecretStr = SecretStr("local-operator-change-me")
    token_hash_pepper: SecretStr = SecretStr("local-token-pepper-change-me")
    # Optional, time-boxed staging-only access bypass. Never embed this value in a client build.
    shared_tester_code: SecretStr | None = None
    shared_tester_code_expires_at: datetime | None = None
    delivery_signing_key: SecretStr = SecretStr("local-delivery-key-change-me")
    public_api_base_url: str = "http://127.0.0.1:8000"
    approved_consent_version: str | None = None
    # Seedance generation uses the ModelArk API key. The private real-human asset
    # library is a separate API surface authenticated with an Access Key pair.
    byteplus_api_key: SecretStr | None = None
    # Seedance 2.5 won the 20 August three-way proof (liveliness); its edit tasks
    # require ratio=adaptive and duration=-1, enforced in render_pipeline.
    byteplus_model: str = "dreamina-seedance-2-5-260628"
    byteplus_api_base_url: str = "https://ark.ap-southeast.bytepluses.com/api/v3"
    byteplus_project_name: str = "default"
    byteplus_region: str = "ap-southeast-1"
    byteplus_liveness_callback_url: str = "https://starme.hungama.com/v1/byteplus/liveness/callback"
    byteplus_access_key: SecretStr | None = None
    byteplus_secret_key: SecretStr | None = None
    # AIGC asset group (CreateAssetGroup). When set, render inputs are registered
    # as private asset:// references, which is what clears real-face moderation.
    byteplus_asset_group_id: str | None = None
    # Linode object storage hosts render inputs at HTTPS URLs BytePlus can fetch
    # during CreateAsset. The bucket is public; keys are unguessable and inputs
    # should be deleted after registration.
    linode_endpoint_url: str | None = None
    linode_bucket: str | None = None
    linode_cdn_base_url: str | None = None
    linode_prefix: str = "starme/renders"
    linode_access_key: SecretStr | None = None
    linode_secret: SecretStr | None = None
    byteplus_poll_interval_seconds: float = Field(default=5, ge=1, le=60)
    byteplus_task_timeout_seconds: int = Field(default=900, ge=60, le=3600)
    render_work_dir: str = "tmp/renders"
    # Operator-registered face assets for named internal testers, keyed by
    # tester_reference (JSON object in the environment). Bridges orders created
    # with synthetic face ids until the Android identity upload exists.
    tester_face_assets: dict[str, str] = {}
    # Staging cost control: cap how many episodes a full render produces per
    # order. Unset renders the package's complete episode count.
    render_episode_limit: int | None = Field(default=None, ge=1, le=10)
    # Every swapped window is face-matched against the subscriber's reference
    # portrait (media_dir/faces/{tester_reference}.*) and re-rolled on failure.
    face_qa_enabled: bool = True
    render_max_rolls: int = Field(default=3, ge=1, le=5)
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
        if self.environment == "production" and self.shared_tester_code is not None:
            raise ValueError("Shared tester access is forbidden in production")
        if (self.shared_tester_code is None) != (self.shared_tester_code_expires_at is None):
            raise ValueError("Configure both shared tester code and its expiry, or neither")
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
