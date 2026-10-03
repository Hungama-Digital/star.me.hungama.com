"""The App's listing screen: editorial metadata for the shows on offer.

Hand-authored rather than derived. The render pipeline knows a show by its
``shell_id``; marketing knows it by its distribution barcode, its genre string
and its artwork, and none of that can be computed from the pipeline. Both ids
travel together so the App never has to map one to the other. Three
titles that change a few times a year do not earn a table, a migration and an
admin screen, so they live here as data.

Artwork is stored as a bucket-relative path, not a full URL: the CDN host
belongs to configuration, and baking it in here is how a staging build ends up
serving production links.
"""

from __future__ import annotations

from starme.config import Settings
from starme.schemas import ListingArtwork, ListingCastMember, ListingItem

#: Stands in for cast that has not been supplied. The App renders the list
#: directly, so a placeholder row is safer than an absent key.
NOT_AVAILABLE = "NA"

_UNKNOWN_CAST = ({"name": NOT_AVAILABLE, "image": NOT_AVAILABLE},)

#: (relative artwork paths are resolved against the CDN base at request time)
APP_LISTING: tuple[dict, ...] = (
    {
        "content_id": "8903247971336",
        "shell_id": "ek-love-story-001",
        "content_title": "Ek Love Story Aisi Bhi",
        "content_type": "Trailer",
        "content_genre": "Drama . Romance . Sci-Fi",
        "actor": "AI Characters . Yuvraj Juneja",
        "age_rating": "13+",
        "audio_language": "Hindi",
        "release_date": "2026-09-30",
        "year_of_release": 2026,
        "original_show_name": "Ek Love Story Aisi Bhi",
        "landscape": "artwork/landscape/ek-love-story-aisi-bhi.png",
        "portrait": "artwork/portrait/mars-ek-lovestory-aisi-bhi.jpg",
        "cast": _UNKNOWN_CAST,
    },
    {
        "content_id": "8903247944354",
        "shell_id": "camouflage-001",
        "content_title": "Camouflage",
        "content_type": "Trailer",
        "content_genre": "Drama . Dual Identity . Loyalty Test . Mistaken . Romance",
        "actor": NOT_AVAILABLE,
        "age_rating": "13+",
        "audio_language": "English",
        "release_date": "2026-05-20",
        "year_of_release": 2026,
        "original_show_name": "Camouflage",
        "landscape": "artwork/landscape/camouflage.png",
        "portrait": "artwork/portrait/camouflage.jpg",
        "cast": _UNKNOWN_CAST,
    },
    {
        "content_id": "8903247943326",
        "shell_id": "echoes-of-vengeance-001",
        "content_title": "Echoes of Vengeance",
        "content_type": "Trailer",
        "content_genre": "Drama . High Fashion World . Revenge . Romance",
        "actor": NOT_AVAILABLE,
        "age_rating": "13+",
        "audio_language": "English",
        "release_date": "2026-05-20",
        "year_of_release": 2026,
        "original_show_name": "Echoes of Vengeance",
        "landscape": "artwork/landscape/echoes-of-vengeance.png",
        "portrait": "artwork/portrait/echoes-of-vengeance.jpg",
        "cast": _UNKNOWN_CAST,
    },
)


def asset_url(relative: str, settings: Settings) -> str:
    """Absolute CDN URL for a bucket-relative artwork path.

    Returns the path unchanged when no CDN is configured, so a local run shows
    an obviously relative link instead of the endpoint failing: a listing
    screen that 500s is worse than one with a visibly wrong image path.
    """
    base = (settings.linode_cdn_base_url or "").rstrip("/")
    prefix = settings.linode_app_prefix.strip("/")
    return f"{base}/{prefix}/{relative}" if base else f"{prefix}/{relative}"


def app_listing(settings: Settings) -> tuple[ListingItem, ...]:
    """The listing, in the order the App should show it."""
    return tuple(
        ListingItem(
            **{k: v for k, v in row.items()
               if k not in {"landscape", "portrait", "cast"}},
            artwork=ListingArtwork(
                landscape=asset_url(row["landscape"], settings),
                portrait=asset_url(row["portrait"], settings),
            ),
            cast=[ListingCastMember(**m) for m in row["cast"]],
        )
        for row in APP_LISTING
    )
