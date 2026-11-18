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
    # Which swap method the render pipeline uses. "direct" is the single-call
    # edit that shipped Episode 1 on 22-25 August. "masked" is the three-stage
    # pipeline: white out the head, have an LLM write the fill prompt, then
    # rebuild the head from the reference. Masked costs about twice as much and
    # carries face SHAPE, hairline and eyewear rather than mapping features
    # onto the original skull - the difference between a slimmer version of
    # the subscriber and the subscriber.
    render_method: str = "direct"
    # Masked staging runs on Seedance 2.0, not 2.5. On 2.5 the mask stage draws
    # a rigid axis-aligned rectangle and the fill stage prints a photo inside
    # it, borders and all (measured 26 August). 2.0's mask follows the head and
    # its fill reconstructs it.
    byteplus_masked_model: str = "dreamina-seedance-2-0-260128"
    #: Seedream, the artwork-swap fallback for when gpt-image-2 cannot serve.
    #:
    #: The version is load-bearing and NOT interchangeable. Measured 5 Oct
    #: 2026 on the Camouflage poster against the source photo:
    #:
    #:     seedream-5-0-260128   +0.880   swaps the face
    #:     seedream-4-0-250828   +0.019   re-renders the poster with the
    #:                                    ORIGINAL actor and never swaps
    #:
    #: A silent downgrade to 4-0 would therefore ship posters that look
    #: finished and have the wrong person in them.
    byteplus_image_model: str = "seedream-5-0-260128"
    byteplus_prompt_llm: str = "seed-2-0-pro-260328"
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
    # Where subscriber portraits land when the App registers a face. Kept
    # apart from media_dir on purpose: show assets are a read-only
    # passthrough, and this holds personal data the API must be able to
    # write. Operator-placed portraits under media_dir/faces still work.
    faces_dir: str = "/faces"

    # ── Ops CMS (/ops) ─────────────────────────────────────────────────────
    # Finished videos wait in AWAITING_QC until a reviewer approves them in
    # the CMS. Artwork is never gated.
    video_qc_gate: bool = True
    # The CMS has no login: it is reachable only from these networks, judged
    # by the X-Real-IP nginx sets from $remote_addr (clients cannot forge it).
    ops_allowed_networks: str = "10.0.0.0/8,127.0.0.1/32"
    # One team password: any email signs in with it (new emails become
    # reviewers). Unset = personal passwords only. Lives in the server .env.
    ops_shared_password: SecretStr | None = None

    # ── App artwork swap (selfie -> series key art) ────────────────────────
    # gpt-image-2 repaints the artwork character's face. Chosen on measured
    # likeness against Neeraj's reference on the real Mars posters, 4 Sep 2026:
    # gpt-image-2 scored +0.848 portrait / +0.818 landscape, Seedream 5.0
    # +0.805 / +0.749, gemini-3-pro-image +0.704 / +0.720. Nano banana
    # (gemini-2.5-flash-image) refuses the task outright - finishReason
    # IMAGE_OTHER with no output - so it is not an option.
    openai_api_key: SecretStr | None = None
    openai_image_model: str = "gpt-image-2"
    #: Rendering effort asked of the image model, sent explicitly rather than
    #: left to the provider's default.
    #:
    #: "medium", not "high", on measurement. Same poster, same selfie, timing
    #: one call and scoring the face against the source with insightface:
    #:
    #:     low      17.1s   +0.941
    #:     medium   46.1s   +0.917
    #:     high     81.2s   +0.948
    #:
    #: Re-measured 5 Oct 2026 under the real concurrent load, portrait size:
    #:
    #:     low      16.6s   +0.958
    #:     medium   33.2s   +0.956 / +0.947 / +0.961
    #:
    #: "low" was tried for the 30 second budget and REVERTED. It was measured
    #: on one poster, Camouflage, whose face is large, and it held up there at
    #: +0.958. Across all three posters it does not:
    #:
    #:                        low      medium
    #:     camouflage lands  +0.957    +0.920
    #:     pehchan landscape +0.789    +0.918
    #:     ek-love  landscape +0.434   +0.809   <- not the right man
    #:
    #: Likeness tracks the face's pixel size, and a wide two-hander gives the
    #: model ~150px to work with. At "low" that is not enough and the face
    #: comes back generic. "medium" is the floor that survives every poster,
    #: and the batch costs 45 to 55s because of it. That trade is deliberate.
    openai_image_quality: str = "medium"
    openai_base_url: str = "https://api.openai.com/v1"
    # Where selfies, series artwork and swapped results live in the bucket.
    # Deliberately NOT linode_prefix ("starme/renders"), which the delivery
    # signer owns and cleanup scripts sweep.
    linode_app_prefix: str = "starme/app-assets"
    # How long the app should wait between polls of an artwork job. Returned
    # in the submit response so the client does not hardcode its own guess.
    # 5, not 15: a batch of three now finishes in ~36s, and a 15s tick hid a
    # finished job for up to 15 more seconds of loading screen for nothing.
    artwork_poll_seconds: int = Field(default=5, ge=5, le=120)

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
