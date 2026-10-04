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
from starme.schemas import (
    ListingArtwork,
    ListingCastMember,
    ListingItem,
    ShowEpisode,
    ShowEpisodes,
)

#: Stands in for cast that has not been supplied. The App renders the list
#: directly, so a placeholder row is safer than an absent key.
NOT_AVAILABLE = "NA"

#: The metadata feed packs several things into one "Actor" string separated by
#: " . ", and not all of them are people. "Vertical TV" is the format and
#: "AI Characters" is how the cast was produced; both would otherwise appear on
#: the cast rail as performers. Matched case-insensitively on the trimmed
#: value.
NON_ACTORS = frozenset({"vertical tv", "ai characters", "na", "n/a", ""})

#: Shown until the feed carries real cast photography. A generated neutral
#: silhouette rather than a stock face: a placeholder that looks like a
#: specific person is worse than one that obviously is not.
DEFAULT_CAST_IMAGE = "artwork/cast/default-actor.png"


def cast_from_actor_field(actor: str, settings: Settings) -> list[dict]:
    """Split the feed's Actor string into cast rows, dropping non-people.

    Returns the NA placeholder rather than an empty list when nothing
    survives: the App renders this list directly, so an empty one is a blank
    rail where a placeholder is a readable "cast not listed". The placeholder
    carries the default avatar too, so `image` is never a non-URL the App has
    to guard against.
    """
    image = asset_url(DEFAULT_CAST_IMAGE, settings)
    names = [part.strip() for part in (actor or "").split(".")]
    people = [n for n in names if n and n.lower() not in NON_ACTORS]
    # Every row carries a usable image, including the placeholder one, so the
    # App can bind the same <Image> for all of them with no special case.
    if not people:
        return [{"name": NOT_AVAILABLE, "image": image}]
    return [{"name": n, "image": image} for n in people]

#: (relative artwork paths are resolved against the CDN base at request time)
APP_LISTING: tuple[dict, ...] = (
    {
        "content_id": "8903247942268",
        "shell_id": "pehchan-jhoothi-hai-001",
        "content_title": "Pehchan Jhoothi Hai",
        "content_type": "Trailer",
        # PROVISIONAL: no metadata was supplied for this title, unlike the
        # other two. Replace genre and the dates when the feed carries them.
        "content_genre": "Drama . Mistaken Identity . Romance . Thriller",
        "actor": NOT_AVAILABLE,
        "age_rating": "13+",
        "audio_language": "Hindi",
        "release_date": "2026-05-20",
        "year_of_release": 2026,
        "original_show_name": "Pehchan Jhoothi Hai",
        "landscape": "artwork/landscape/pehchan-jhoothi-hai.png",
        "portrait": "artwork/portrait/pehchan-jhoothi-hai.jpg",
    },
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
               if k not in {"landscape", "portrait"}},
            artwork=ListingArtwork(
                landscape=asset_url(row["landscape"], settings),
                portrait=asset_url(row["portrait"], settings),
            ),
            cast=[ListingCastMember(**m)
                  for m in cast_from_actor_field(row["actor"], settings)],
        )
        for row in APP_LISTING
    )


#: Episodes per show. Separate from APP_LISTING because the catalogue screen
#: and the episode screen are different calls: the listing must stay small and
#: cacheable, and nothing there needs a ten-item array it will not render.
#:
#: `content_base` + "S01E<n>" is the distribution content id, which is how the
#: rest of Hungama addresses a single episode. It is built rather than listed
#: because the pattern is fixed and ten hand-written ids per show is ten
#: chances to fat-finger one.
#:
#: `videos` holds only the episodes that have actually been produced. The rest
#: are still announced, with an empty video_url, so the App can show the full
#: run of ten with the unreleased ones greyed out rather than pretending the
#: show is three episodes long.
SHOW_EPISODES: dict[str, dict] = {
    "pehchan-jhoothi-hai-001": {
        "content_base": "EVN202638734",
        "total_episodes": 10,
        "videos": {
            1: "episodes/pehchan-jhoothi-hai/pehchan-jhoothi-hai-ep1.mp4",
            2: "episodes/pehchan-jhoothi-hai/pehchan-jhoothi-hai-ep2.mp4",
            3: "episodes/pehchan-jhoothi-hai/pehchan-jhoothi-hai-ep3.mp4",
        },
    },
    "ek-love-story-001": {
        "content_base": "EVN202639405",
        "total_episodes": 10,
        "videos": {},
    },
    "camouflage-001": {
        "content_base": "EVN202638822",
        "total_episodes": 10,
        "videos": {},
    },
}

#: Episodes that exist but have no file yet carry "" rather than null, so the
#: App binds one string type and decides on truthiness instead of null checks.
NO_VIDEO = ""


def show_episodes(shell_id: str, settings: Settings):  # noqa: ANN201
    """The episode list for one show, or None when the shell is unknown."""
    plan = SHOW_EPISODES.get(shell_id)
    row = next((r for r in APP_LISTING if r["shell_id"] == shell_id), None)
    if plan is None or row is None:
        return None
    portrait = asset_url(row["portrait"], settings)
    landscape = asset_url(row["landscape"], settings)
    episodes = [
        ShowEpisode(
            episode_number=n,
            episode_name=f"Episode {n}",
            content_id=f"{plan['content_base']}S01E{n}",
            # Episode artwork repeats the show's today. Resolved here rather
            # than left for the App to copy, so per-episode stills can be
            # introduced later without an App release.
            portrait=portrait,
            landscape=landscape,
            video_url=(asset_url(plan["videos"][n], settings)
                       if n in plan["videos"] else NO_VIDEO),
        )
        for n in range(1, plan["total_episodes"] + 1)
    ]
    return ShowEpisodes(
        shell_id=shell_id,
        show_id=row["content_id"],
        show_name=row["content_title"],
        portrait=portrait,
        landscape=landscape,
        total_episodes=plan["total_episodes"],
        episodes=episodes,
    )
