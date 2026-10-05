"""Per-poster scene cards: how a swapped face is made to belong to its artwork.

Written after a product review of the first outputs. The complaint was that
the swap got the identity right but not the integration: the face arrived
front-lit, neutral, clean and phone-sharp, because all of that rides along
with the identity out of a selfie. On photographic posters it passed; on the
painted one it read as a photo stuck onto a painting.

One global prompt cannot fix it, and that was measured rather than assumed. A
generic improvement with no poster knowledge scored WORSE on likeness than the
prompt it replaced (+0.768 against +0.882), while the same instructions with
this poster's own light, grade, style and expression held likeness at +0.851
AND brought the lead's sharpness from 0.73 to 0.84 of the co-star's. The
per-poster values are what make it work.

Costs nothing at runtime: a 9-image batch measured 52s with these cards
against 51s with the old global prompt.

Adding a show means writing its card. A shell with no card falls back to the
old global prompt rather than failing, so a new show still swaps, just without
the integration pass.
"""

from __future__ import annotations

#: Shared across every card. Kept out of the per-show text so a fix here
#: reaches all posters, and so the per-show entries stay purely editorial.
_TAKE_IDENTITY_ONLY = (
    "From image 2 take ONLY the identity: face shape, eyes, nose, mouth, skin "
    "tone and facial hair. Do NOT take its lighting, expression, head angle, "
    "camera look or image quality. Do not beautify, slim or age the face.\n"
)

_BLEND = (
    "- Blend: no visible edge at the jaw, hairline, ears or neck; face and "
    "neck skin tones match; the jaw casts its shadow on the neck.\n"
)

_AVOID = (
    "Avoid: pasted or cut-out look, sticker edges, halo around the face, flat "
    "front lighting, selfie or phone-camera look, smooth plastic skin, "
    "over-sharpened face, face and neck tone mismatch, any change to the "
    "co-star or the text."
)

#: One entry per shell. Every value is a description of THIS poster, read off
#: the artwork itself: where its light comes from, how it is graded, whether
#: it is painted or photographic, and what the lead's face is doing.
SCENE_CARDS: dict[str, dict[str, str]] = {
    "ek-love-story-001": {
        "show": "Ek Love Story Aisi Bhi",
        "lead": "the male lead, the man on the right in the denim jacket",
        "light": (
            "a strong warm golden sunset backlight from behind and to the "
            "right, an orange rim along the hair, cheekbone and jaw on the "
            "right, and the left side of the face falling into deep warm "
            "shadow. No frontal fill"
        ),
        "colour": (
            "the poster's amber and teal grade, warm highlights and cool "
            "shadows, the same saturation as the co-star"
        ),
        # The painted one. This is the poster the product note called out as
        # failing worst, and the only one in the catalogue that is not a
        # photograph.
        "style": (
            "a painted cinematic matte illustration. Render the face in that "
            "painted style, with the same film grain, atmospheric haze and "
            "brushwork as the rest of the poster. It must not look "
            "photographic"
        ),
        "costar": "the woman's face beside him",
        "pose": (
            "his original head angle, gaze off to the right, and his calm, "
            "resolute expression from image 1"
        ),
        "keep": (
            "the woman, clothes, bodies, the hillside town, the moon, "
            "composition, title lettering and logos"
        ),
    },
    "pehchan-jhoothi-hai-001": {
        "show": "Pehchan Jhoothi Hai",
        "lead": "the male lead, the bearded man on the right in the dark navy shirt",
        "light": (
            "warm tungsten light from the corridor lamps behind and to the "
            "right, a soft amber rim on the right cheek and ear, cool blue "
            "window light spilling from the far left, and the left side of "
            "the face in low, moody shadow. Low-key overall, no bright "
            "frontal fill"
        ),
        "colour": (
            "the poster's warm amber and cool blue split grade, deep shadows, "
            "restrained saturation, matching the co-star"
        ),
        "style": (
            "a photographic cinematic still with shallow depth of field and "
            "fine film grain. Match that grain and the slight softness of the "
            "plate"
        ),
        "costar": "the woman's face beside him",
        "pose": (
            "his original head angle, direct gaze into the lens, and his "
            "guarded, serious expression from image 1"
        ),
        "keep": (
            "the woman, clothes, bodies, the mansion corridor, the lamps, "
            "composition, title lettering and logos"
        ),
    },
    "camouflage-001": {
        "show": "Camouflage",
        "lead": "the male lead, the man on the left in the black leather jacket",
        "light": (
            "warm tungsten from the two pendant lamps overhead and slightly "
            "front-left, a soft highlight across the forehead and cheekbones, "
            "shadow under the brow and jaw, and a dim red bounce from the "
            "tiled wall behind. No flat frontal fill"
        ),
        "colour": (
            "the poster's warm amber highlights against the deep red and "
            "near-black background, the same contrast and saturation as the "
            "co-star"
        ),
        "style": (
            "a photographic studio still with natural skin texture and fine "
            "grain. Match the plate's grain and contrast"
        ),
        "costar": "the woman's face beside him",
        "pose": (
            "his original head angle, his gaze, and his composed, faintly "
            "amused expression from image 1"
        ),
        "keep": (
            "the woman, clothes, bodies, the bar shelving, the red tiled "
            "wall, composition, title lettering and logos"
        ),
    },
}


def swap_prompt(shell_id: str) -> str | None:
    """Poster prompt for this shell, or None when it has no card yet."""
    card = SCENE_CARDS.get(shell_id)
    if card is None:
        return None
    return (
        f"Edit image 1 (the poster for {card['show']}). Replace the face of "
        f"{card['lead']}, with the person in image 2.\n"
        + _TAKE_IDENTITY_ONLY
        + "Make the face belong to the poster:\n"
        f"- Lighting: relight the face for {card['light']}.\n"
        f"- Colour: apply {card['colour']}.\n"
        f"- Style and texture: this poster is {card['style']}.\n"
        f"- Detail: exactly the same sharpness and skin texture as "
        f"{card['costar']}. Not sharper.\n"
        f"- Expression and pose: keep {card['pose']}.\n"
        "- Hair: keep the poster's hairstyle.\n"
        + _BLEND
        + f"Keep everything else in image 1 unchanged: {card['keep']}.\n"
        + _AVOID
    )


def character_prompt(shell_id: str) -> str | None:
    """Single-character still for this shell, or None when it has no card."""
    card = SCENE_CARDS.get(shell_id)
    if card is None:
        return None
    return (
        f"Image 1 is the poster for {card['show']}. Image 2 is the user's "
        f"selfie. Produce a single-character publicity portrait of "
        f"{card['lead']}, but with the face of the person in image 2, facing "
        "the camera straight on, head and shoulders, neutral relaxed "
        "expression.\n"
        + _TAKE_IDENTITY_ONLY
        + f"- Lighting: {card['light']}.\n"
        f"- Colour: apply {card['colour']}.\n"
        f"- Style and texture: {card['style']}.\n"
        "- Keep the wardrobe the man wears in image 1. Background is a soft "
        "out-of-focus continuation of image 1's own setting.\n"
        + _BLEND
        + "Remove every other person. Remove ALL text, titles and logos.\n"
        + _AVOID
    )
