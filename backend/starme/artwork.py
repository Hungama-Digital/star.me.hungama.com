"""Paint a user's selfie onto a series' key artwork.

Three moving parts behind the App's three calls:

1. ``store_selfie`` publishes the selfie and hands back a public URL, so the
   App can render the user's own face anywhere without keeping the bytes.
2. ``submit`` records the request and queues it.
3. ``run_artwork_swap`` does the slow bit - fetch artwork, fetch selfie, ask
   the image model to replace the character's face, publish the result.

Asynchronous because the image model takes 40 to 60 seconds. A phone request
must not hold open that long, so submit returns an id and the App polls.

The model is gpt-image-2, picked on measured likeness rather than taste.
Scored against Neeraj's reference portrait on the real Mars posters,
4 Sep 2026 - cosine similarity of the swapped face, insightface buffalo_s:

    gpt-image-2            portrait +0.848   landscape +0.818
    seedream-5-0-260128    portrait +0.805   landscape +0.749
    gemini-3-pro-image     portrait +0.704   landscape +0.720
    gemini-2.5-flash-image ("nano banana")   refuses outright

Nano banana returns finishReason IMAGE_OTHER with no image and no safety
category, on both a detailed and a stripped-down prompt: Google blocks
identity face-swaps on it, so it is not a fallback. Seedream was the
runner-up and can hit an exact output aspect, which gpt-image-2 cannot;
likeness decided it.

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
#: bigger than it would upload fine and then 403 for the App. Measured
#: 3 Sep 2026: 64MB served, 128MB did not.
CDN_MAX_BYTES = 64 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
#: The only sizes gpt-image-2 accepts. It cannot render an arbitrary WxH, so a
#: 16:9 poster comes back 3:2 - the closest of these - and the App letterboxes
#: or crops. Asked for no size at all it returns a SQUARE, which silently
#: re-crops portrait key art, so one of these is always sent.
OPENAI_SIZES = {
    "portrait": "1024x1536",
    "landscape": "1536x1024",
    "square": "1024x1024",
}
#: Read from the returned bytes rather than assumed: gpt-image-2 answers PNG
#: today, Seedream answered JPEG, and publishing one as the other mislabels
#: every result.
IMAGE_MAGIC = (
    (b"\xff\xd8\xff", "jpg", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
    (b"RIFF", "webp", "image/webp"),
)

QUEUED, RUNNING, SUCCEEDED, FAILED = "queued", "running", "succeeded", "failed"
TERMINAL = {SUCCEEDED, FAILED}

#: Every clause here was earned by a failure on the real posters:
#:  - "the YOUNG MAN", not "the main character": these posters carry two
#:    people and the generic wording is ambiguous.
#:  - the proportions sentence: without it the head came back oversized on an
#:    unchanged neck - the bobblehead Amol caught on the landscape poster,
#:    which also dropped likeness from +0.685 to +0.436 once constrained.
#:  - "CLEARLY and UNMISTAKABLY": the models hedge back towards the original
#:    face unless pushed, and likeness is the whole point of the feature.
#:  - the title-text sentence: image models redraw lettering, and this
#:    poster's Hindi and ornate English title must stay legible.
#:  - the reference-photo exclusions: an earlier run put the reference's own
#:    shirt onto the character across three segments.
SWAP_PROMPT = (
    "Image 1 is a movie poster. Image 2 is a photograph of a man. "
    "Replace ONLY the face and head of the YOUNG MAN in image 1 with the face "
    "of the man in image 2. His new face must be CLEARLY and UNMISTAKABLY the "
    "man from image 2 - same bone structure, same eyes, nose and mouth, same "
    "greying hairline, same age. Render the face at high detail. Match image "
    "1's lighting, camera angle and head tilt. "
    "Keep natural human proportions: the head must be the same size, angle "
    "and position as the head it replaces, sitting correctly on the SAME neck "
    "and shoulders, which must not change width or shape. Do not enlarge the "
    "head. "
    "Do NOT change any other person in image 1 - their face, hair, expression "
    "and clothing must stay exactly as they are. All title text and any "
    "non-English text must remain correctly spelled, undistorted and legible. "
    "Keep the composition, framing, subject scale and position, the "
    "background, all clothing and the colour grade unchanged. Do not zoom, "
    "re-crop or re-stage the artwork. Do not copy the background, suit, shirt "
    "or tie from image 2."
)


class ArtworkError(RuntimeError):
    """Raised when a swap cannot be attempted or the model refused it."""


def image_kind(raw: bytes) -> tuple[str, str]:
    """(extension, content type) from the leading bytes, defaulting to PNG."""
    for magic, extension, content_type in IMAGE_MAGIC:
        if raw.startswith(magic):
            return extension, content_type
    return "png", "image/png"


def read_dimensions(raw: bytes) -> tuple[int, int] | None:
    """Width and height from a PNG or JPEG header, without Pillow.

    Only the first few KB are needed, so a caller can range-request rather
    than download whole artwork just to learn its shape.
    """
    if raw.startswith(b"\x89PNG\r\n\x1a\n") and len(raw) >= 24:
        return int.from_bytes(raw[16:20], "big"), int.from_bytes(raw[20:24], "big")
    if raw.startswith(b"\xff\xd8"):
        index = 2
        while index + 9 < len(raw):
            if raw[index] != 0xFF:
                index += 1
                continue
            marker = raw[index + 1]
            # SOF0..SOF15, skipping the non-frame markers in that range
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                height = int.from_bytes(raw[index + 5:index + 7], "big")
                width = int.from_bytes(raw[index + 7:index + 9], "big")
                return width, height
            segment = int.from_bytes(raw[index + 2:index + 4], "big")
            if segment <= 0:
                return None
            index += 2 + segment
    return None


def openai_size(width: int, height: int) -> str:
    """Nearest gpt-image-2 size to the artwork's own aspect."""
    if width <= 0 or height <= 0:
        return OPENAI_SIZES["portrait"]
    aspect = width / height
    if aspect <= 0.9:
        return OPENAI_SIZES["portrait"]
    if aspect >= 1.1:
        return OPENAI_SIZES["landscape"]
    return OPENAI_SIZES["square"]


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


def slugify(value: str) -> str:
    """A name safe to put in an object key, and therefore in a URL.

    The App collects a human name; keys that keep spaces or brackets need
    percent-encoding forever after, which is how a hardcoded URL quietly
    breaks. Falls back to "user" when a name has nothing usable in it, so a
    name in another script still uploads instead of erroring.
    """
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return (cleaned or "user")[:60]


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


def artwork_urls_for(shell_id: str, settings: Settings) -> tuple[str, str]:
    """Conventional portrait and landscape artwork paths for a shell.

    Portrait keeps the bare ``<shell_id>.png`` name it already had, because
    artwork was uploaded under it before landscape existed and renaming would
    break the shell already in use.
    """
    portrait = artwork_url_for(shell_id, settings)
    base = portrait.rsplit(".", 1)[0]
    return portrait, f"{base}-landscape.png"


def artwork_url_for(shell_id: str, settings: Settings) -> str:
    """Where a series' key artwork is expected to live.

    Refuses rather than returning a schemeless path: with no CDN configured
    this used to build "/starme/app-assets/artwork/x.png", which submitted
    happily and then failed deep in the worker with "Request URL is missing
    an 'http://' or 'https://' protocol". Caught by the inline-queue test.
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
    landscape_artwork_url: str | None,
    settings: Settings,
) -> ArtworkSwap:
    """Record a swap request. Does not call the model - the worker does."""
    source = image_url or (selfie.public_url if selfie else None)
    if not source:
        raise ArtworkError("Provide either selfie_id or image_url")
    # An explicit artwork_url means "use exactly this". No landscape is
    # invented from it: a derived "-landscape" guess would usually 404 and
    # deriving it needs a CDN base the caller has just made irrelevant.
    # Only when neither is given does the shell's convention apply.
    if artwork_url or landscape_artwork_url:
        portrait, landscape = artwork_url, landscape_artwork_url
        if portrait is None:
            portrait, _ = artwork_urls_for(shell_id, settings)
    else:
        portrait, landscape = artwork_urls_for(shell_id, settings)
    row = ArtworkSwap(
        tester_reference=tester_reference,
        selfie_id=selfie.id if selfie else None,
        source_image_url=source,
        shell_id=shell_id,
        artwork_url=portrait,
        landscape_artwork_url=landscape,
        status=QUEUED,
    )
    session.add(row)
    session.flush()
    return row


def _fetch(url: str, client: httpx.Client) -> tuple[bytes, str]:
    """Download one input. gpt-image-2 takes bytes, not URLs."""
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
    size: str | None = None,
    transport: httpx.BaseTransport | None = None,
) -> bytes:
    """Ask gpt-image-2 to repaint the artwork character's face.

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
    data = {
        "model": settings.openai_image_model,
        "prompt": SWAP_PROMPT,
        "n": "1",
        "size": size or OPENAI_SIZES["portrait"],
    }
    with httpx.Client(
        base_url=settings.openai_base_url.rstrip("/"),
        transport=transport,
        timeout=httpx.Timeout(600.0, connect=15.0),
        headers={
            "Authorization": f"Bearer {settings.openai_api_key.get_secret_value()}"
        },
    ) as client:
        response = client.post("/images/edits", data=data, files=files)
    if response.status_code >= 400:
        # The model's own refusal text is the useful part; it comes back here
        # and nowhere else, so it is surfaced rather than flattened to 502.
        raise ArtworkError(
            f"Image model returned HTTP {response.status_code}: {response.text[:400]}"
        )
    payload = response.json()
    items = payload.get("data") or []
    if not items or not items[0].get("b64_json"):
        raise ArtworkError(f"Image model returned no image: {str(payload)[:300]}")
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
    # is already polling for.
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

    problems: list[str] = []
    try:
        with httpx.Client(transport=transport, timeout=httpx.Timeout(120.0)) as client:
            # The selfie is fetched once and reused for both aspects.
            selfie, selfie_type = _fetch(row.source_image_url, client)
            artworks: list[tuple[str, str]] = [("portrait", row.artwork_url)]
            if row.landscape_artwork_url:
                artworks.append(("landscape", row.landscape_artwork_url))
            fetched: list[tuple[str, bytes, str]] = []
            for aspect, url in artworks:
                try:
                    raw, kind = _fetch(url, client)
                    fetched.append((aspect, raw, kind))
                except ArtworkError as exc:
                    # A shell with no landscape key art is normal, so a missing
                    # one is noted and skipped rather than failing the job.
                    problems.append(f"{aspect}: {exc}")
    except Exception as exc:  # noqa: BLE001 - the selfie itself is unusable
        row.status = FAILED
        row.failure_reason = f"{type(exc).__name__}: {exc}"[:1000]
        row.completed_at = datetime.now(UTC)
        session.commit()
        return row

    store = None
    prefix = settings.linode_app_prefix.strip("/")
    for aspect, artwork, artwork_type in fetched:
        try:
            shape = read_dimensions(artwork[:65536])
            result = swap_face_onto_artwork(
                artwork=artwork, artwork_type=artwork_type,
                selfie=selfie, selfie_type=selfie_type,
                settings=settings,
                size=openai_size(*shape) if shape else None,
                transport=transport,
            )
            if len(result) > CDN_MAX_BYTES:
                raise ArtworkError(
                    f"the generated artwork is {len(result) / 1e6:.1f}MB, which "
                    "the CDN will not serve"
                )
            store = _storage(settings, storage) if store is None else store
            extension, content_type = image_kind(result)
            suffix = "" if aspect == "portrait" else f"-{aspect}"
            key = f"{prefix}/artwork-swaps/{row.id}{suffix}.{extension}"
            store.put(key, result, content_type)
            if aspect == "portrait":
                row.result_object_key, row.result_url = key, store.public_url(key)
            else:
                row.landscape_object_key = key
                row.landscape_url = store.public_url(key)
        except Exception as exc:  # noqa: BLE001 - per aspect, so one can survive
            problems.append(f"{aspect}: {type(exc).__name__}: {exc}")

    # Succeeds on a partial result: one usable image beats none, and the App
    # is told what is missing through `error` rather than being left to guess
    # why a URL is null.
    row.status = SUCCEEDED if (row.result_url or row.landscape_url) else FAILED
    row.failure_reason = "; ".join(problems)[:1000] if problems else None
    row.completed_at = datetime.now(UTC)
    session.commit()
    return row
