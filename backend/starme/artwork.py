"""Paint a user's selfie onto a series' key artwork.

Three moving parts behind the App's three calls:

1. ``store_selfie`` publishes the selfie and hands back a public URL, so the
   App can render the user's own face anywhere without keeping the bytes.
2. ``submit`` records the request and queues it.
3. ``run_artwork_swap`` does the slow bit - fetch artwork, fetch selfie, ask
   the image model to replace the character's face, publish the result.

Asynchronous because the image model takes tens of seconds. A phone request
must not hold open that long, so submit returns an id and the App polls.

The HTTP transport is injectable, matching ``seedance.py``, so every path
here is testable without a key or a network.
"""

from __future__ import annotations

import base64
import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from sqlalchemy.orm import Session

from starme.config import Settings
from starme.linode_storage import LinodeObjectStorage
from starme.models import AppSelfie, ArtworkSwap

#: A selfie past this is refused before anything is uploaded. Matches the
#: render path's portrait ceiling so the two cannot disagree.
MAX_SELFIE_BYTES = 15 * 1024 * 1024
#: images.hungama.com will not serve an object much over this, so a result
#: bigger than it would upload fine and then 404 for the App. Measured
#: 3 Sep 2026: 64MB served, 128MB did not.
CDN_MAX_BYTES = 64 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

QUEUED, RUNNING, SUCCEEDED, FAILED = "queued", "running", "succeeded", "failed"
TERMINAL = {SUCCEEDED, FAILED}

#: What the image model is asked to do. Written the same way the video prompts
#: are: say what to change, then name everything that must survive, because
#: "swap the face" alone also invites a redrawn poster.
SWAP_PROMPT = (
    "Replace only the face and head of the main character in the first image "
    "with the face of the person in the second image. Keep that person's "
    "identity, skin tone, facial features and hairline recognisable. "
    "Everything else in the first image must stay exactly as it is: the "
    "composition, framing, aspect ratio, background, costume, clothing, "
    "lighting, colour grade, any logos, and all text and titles must remain "
    "unchanged and legible. Do not add or remove any person or object, do not "
    "re-stage or re-crop the artwork, and do not copy the background or "
    "clothing from the second image."
)


class ArtworkError(RuntimeError):
    """Raised when a swap cannot be attempted or the model refused it."""


def slugify(value: str) -> str:
    """A name safe to put in an object key, and therefore in a URL.

    The App collects a human name; keys that keep spaces or brackets need
    percent-encoding forever after, which is how a hardcoded URL quietly
    breaks. Falls back to "user" when a name has nothing usable in it, so a
    name in another script still uploads instead of erroring.
    """
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return (cleaned or "user")[:60]


def _storage(
    settings: Settings, storage: LinodeObjectStorage | None = None
) -> LinodeObjectStorage:
    """Storage rooted at the app-assets prefix, not the renders prefix.

    The delivery signer owns ``linode_prefix`` ("starme/renders") and cleanup
    sweeps it, so app assets get their own tree. Built directly rather than
    via ``from_settings`` because that hardcodes the renders prefix.
    Injectable so tests need no credentials.
    """
    if storage is not None:
        return storage
    if not (
        settings.linode_endpoint_url
        and settings.linode_bucket
        and settings.linode_cdn_base_url
        and settings.linode_access_key
        and settings.linode_secret
    ):
        raise ArtworkError("Object storage is not configured")
    return LinodeObjectStorage(
        endpoint_url=settings.linode_endpoint_url,
        bucket=settings.linode_bucket,
        cdn_base_url=settings.linode_cdn_base_url,
        prefix=settings.linode_app_prefix,
        access_key=settings.linode_access_key.get_secret_value(),
        secret_key=settings.linode_secret.get_secret_value(),
    )


@dataclass(frozen=True)
class StoredSelfie:
    selfie_id: str
    display_name: str
    public_url: str
    object_key: str
    size_bytes: int


def store_selfie(
    session: Session,
    *,
    raw: bytes,
    display_name: str,
    content_type: str,
    tester_reference: str,
    settings: Settings,
    storage: LinodeObjectStorage | None = None,
) -> StoredSelfie:
    """Publish a selfie under the user's name and record it."""
    if not raw:
        raise ArtworkError("The uploaded image is empty")
    if len(raw) > MAX_SELFIE_BYTES:
        raise ArtworkError(
            f"That photo is {len(raw) / 1e6:.1f}MB. Please choose one under "
            f"{MAX_SELFIE_BYTES // (1024 * 1024)} MB."
        )
    extension = ALLOWED_IMAGE_TYPES.get((content_type or "").lower())
    if extension is None:
        raise ArtworkError(
            f"Unsupported image type {content_type!r}. Send a JPEG, PNG or WebP."
        )
    if not display_name.strip():
        raise ArtworkError("A name is required")

    slug = slugify(display_name)
    store = _storage(settings, storage)
    # The slug is not unique - two people called the same thing must not
    # overwrite each other - so a short random segment keeps them apart while
    # the name stays readable in the URL.
    prefix = settings.linode_app_prefix.strip("/")
    key = f"{prefix}/selfies/{slug}-{secrets.token_hex(4)}.{extension}"
    store.put(key, raw, content_type)
    url = store.public_url(key)
    row = AppSelfie(
        tester_reference=tester_reference,
        display_name=display_name.strip(),
        name_slug=slug,
        object_key=key,
        public_url=url,
        content_type=content_type,
        size_bytes=len(raw),
        checksum_sha256=hashlib.sha256(raw).hexdigest(),
    )
    session.add(row)
    session.flush()
    return StoredSelfie(
        selfie_id=row.id,
        display_name=row.display_name,
        public_url=url,
        object_key=key,
        size_bytes=len(raw),
    )


def artwork_url_for(shell_id: str, settings: Settings) -> str:
    """Where a series' key artwork is expected to live.

    Refuses rather than returning a schemeless path: with no CDN configured
    this used to build "/starme/app-assets/artwork/x.png", which submitted
    happily and then failed deep in the worker with
    "Request URL is missing an 'http://' or 'https://' protocol". Caught by
    the test that runs the queue inline.
    """
    base = (settings.linode_cdn_base_url or "").rstrip("/")
    if not base:
        raise ArtworkError(
            "No CDN base URL is configured, so the artwork for "
            f"{shell_id!r} cannot be located. Pass artwork_url explicitly or "
            "set STARME_LINODE_CDN_BASE_URL."
        )
    prefix = settings.linode_app_prefix.strip("/")
    return f"{base}/{prefix}/artwork/{shell_id}.png"


def submit(
    session: Session,
    *,
    tester_reference: str,
    shell_id: str,
    selfie: AppSelfie | None,
    image_url: str | None,
    artwork_url: str | None,
    settings: Settings,
) -> ArtworkSwap:
    """Record a swap request. Does not call the model - the worker does."""
    source = image_url or (selfie.public_url if selfie else None)
    if not source:
        raise ArtworkError("Provide either selfie_id or image_url")
    row = ArtworkSwap(
        tester_reference=tester_reference,
        selfie_id=selfie.id if selfie else None,
        source_image_url=source,
        shell_id=shell_id,
        artwork_url=artwork_url or artwork_url_for(shell_id, settings),
        status=QUEUED,
    )
    session.add(row)
    session.flush()
    return row


def _fetch(url: str, client: httpx.Client) -> tuple[bytes, str]:
    response = client.get(url)
    if response.status_code >= 400:
        raise ArtworkError(f"Could not fetch {url} (HTTP {response.status_code})")
    content_type = response.headers.get("content-type", "image/png").split(";")[0]
    return response.content, content_type


def swap_face_onto_artwork(
    *,
    artwork: bytes,
    artwork_type: str,
    selfie: bytes,
    selfie_type: str,
    settings: Settings,
    transport: httpx.BaseTransport | None = None,
) -> bytes:
    """Ask the image model to repaint the artwork character's face.

    Both images go in one edit call, artwork first: the prompt refers to them
    by position, so the order is load-bearing.
    """
    if settings.openai_api_key is None:
        raise ArtworkError(
            "No image-model key is configured, so artwork swaps cannot run. "
            "Set STARME_OPENAI_API_KEY."
        )
    files = [
        ("image[]", ("artwork." + ALLOWED_IMAGE_TYPES.get(artwork_type, "png"),
                     artwork, artwork_type or "image/png")),
        ("image[]", ("selfie." + ALLOWED_IMAGE_TYPES.get(selfie_type, "png"),
                     selfie, selfie_type or "image/png")),
    ]
    data = {"model": settings.openai_image_model, "prompt": SWAP_PROMPT, "n": "1"}
    with httpx.Client(
        base_url=settings.openai_base_url.rstrip("/"),
        transport=transport,
        timeout=httpx.Timeout(300.0, connect=15.0),
        headers={"Authorization": f"Bearer {settings.openai_api_key.get_secret_value()}"},
    ) as client:
        response = client.post("/images/edits", data=data, files=files)
    if response.status_code >= 400:
        # The model's own refusal text is the useful part; it comes back here
        # and nowhere else, so it is surfaced rather than flattened to 502.
        detail = response.text[:400]
        raise ArtworkError(f"Image model returned HTTP {response.status_code}: {detail}")
    payload = response.json()
    items = payload.get("data") or []
    if not items or not items[0].get("b64_json"):
        raise ArtworkError("Image model returned no image")
    return base64.b64decode(items[0]["b64_json"])


def run_artwork_swap(
    session: Session,
    swap_id: str,
    *,
    settings: Settings,
    transport: httpx.BaseTransport | None = None,
    storage: LinodeObjectStorage | None = None,
) -> ArtworkSwap:
    """Do the swap and publish it. Terminal either way."""
    row = session.get(ArtworkSwap, swap_id)
    if row is None:
        raise ArtworkError(f"No such artwork swap {swap_id}")
    if row.status in TERMINAL:
        return row
    # Checked before anything is fetched: without a key the job cannot
    # succeed, and two pointless downloads would only delay a failure the App
    # is polling for.
    if settings.openai_api_key is None:
        row.status = FAILED
        row.failure_reason = (
            "No image-model key is configured, so artwork swaps cannot run. "
            "Set STARME_OPENAI_API_KEY."
        )
        row.completed_at = datetime.now(UTC)
        session.commit()
        return row
    row.status = RUNNING
    row.attempt_count += 1
    session.commit()

    try:
        with httpx.Client(transport=transport, timeout=httpx.Timeout(120.0)) as client:
            artwork, artwork_type = _fetch(row.artwork_url, client)
            selfie, selfie_type = _fetch(row.source_image_url, client)
        result = swap_face_onto_artwork(
            artwork=artwork, artwork_type=artwork_type,
            selfie=selfie, selfie_type=selfie_type,
            settings=settings, transport=transport,
        )
        if len(result) > CDN_MAX_BYTES:
            raise ArtworkError(
                f"The generated artwork is {len(result) / 1e6:.1f}MB, which the "
                "CDN will not serve"
            )
        store = _storage(settings, storage)
        key = (f"{settings.linode_app_prefix.strip('/')}/artwork-swaps/"
               f"{row.id}.png")
        store.put(key, result, "image/png")
        row.result_object_key = key
        row.result_url = store.public_url(key)
        row.status = SUCCEEDED
        row.failure_reason = None
    except Exception as exc:  # noqa: BLE001 - recorded so the App can poll it
        row.status = FAILED
        row.failure_reason = f"{type(exc).__name__}: {exc}"[:1000]
    row.completed_at = datetime.now(UTC)
    session.commit()
    return row
