from dataclasses import dataclass


@dataclass(frozen=True)
class SubjectReplacementPrompt:
    text: str
    variant: str


# Verbatim from Akash's Face Swap Studio (faceswap_core.PROPORTION_CLAUSE), the
# engine that produced the product-approved 20 August dashboard run.
_PROPORTION_CLAUSE = (
    "The rendered face must be scaled and proportioned correctly to match the "
    "subject's natural human proportions exactly as they appear in the video "
    "- head size, neck width, shoulder width, chest, arms, and hands must all "
    "be consistent and realistic relative to each other and to the face; the "
    "face must not be larger, smaller, or misaligned relative to the head and "
    "body."
)


def face_swap_prompt(
    *,
    subject_video_desc: str,
    image_desc: str = "",
    extra_notes: str = "",
) -> SubjectReplacementPrompt:
    """The production face-swap prompt (variant face_swap_direct_v2).

    Verbatim port of Face Swap Studio's build_direct_swap_prompt, the exact
    template behind the approved 20 August Seedance 2.5 dashboard run. The
    expression-preservation and scene-lock wording travels in `extra_notes`
    (content-owner metadata), exactly as it did in that run.
    `subject_video_desc` identifies the designated role and must come from
    content-owner metadata, never from pixel inference.
    """
    if not subject_video_desc:
        raise ValueError("subject_video_desc is required")
    img_hint = f" ({image_desc})" if image_desc else ""
    text = (
        f"Strictly edit @Video 1. Define {subject_video_desc} in @Video 1 as "
        f"<Subject 1>; replace <Subject 1>'s face with the face in @Image 1{img_hint}. "
        f"Apply each reference face in every frame, precisely tracking that "
        f"subject's head position, size, orientation and motion, and blend it "
        f"naturally with the neck, skin tone and lighting of the scene. "
        f"{_PROPORTION_CLAUSE} Everything else must remain completely unchanged "
        f"from @Video 1: all body movements and actions, clothing, scene layout, "
        f"background, lighting effects, original audio, video duration, and camera "
        f"movement. Do not modify any other person. Do not add, remove, or alter "
        f"any other element." + (f" {extra_notes}" if extra_notes else "")
    )
    return SubjectReplacementPrompt(text=text, variant="face_swap_direct_v2")


def mask_prompt(*, subject_video_desc: str) -> SubjectReplacementPrompt:
    """Stage 1 of the masked pipeline: white out the designated head.

    Verbatim port of Face Swap Studio's build_mask_prompt. The mask is what
    makes stage 3 a reconstruction rather than an edit: with the head gone,
    the model has to build a new one from the reference, so face shape,
    hairline and eyewear travel with the identity. A direct edit keeps the
    original skull and only repaints the features.

    The wording asks for a rectangle covering all hair. Seedance 2.0 renders
    something head-shaped that tracks the head, which is what is wanted;
    2.5 renders a literal rectangle and stage 3 then fills the rectangle
    instead of the head, which is why the masked method is pinned to 2.0.
    """
    if not subject_video_desc:
        raise ValueError("subject_video_desc is required")
    text = (
        f"Define {subject_video_desc} in @Video 1 as <Subject 1>. Strictly edit "
        f"@Video 1: cover the entire head of <Subject 1> with a solid opaque "
        f"white rectangle. The white rectangle must fully cover the whole face "
        f"and all visible hair of <Subject 1> - forehead, hairline, the full "
        f"hairstyle, ears, chin and jaw - leaving no facial feature or strand of "
        f"hair visible. Render it as flat, solid white with no transparency, no "
        f"texture and no blur, in every frame of the output, tracking the head "
        f"position, size and orientation throughout so the rectangle always "
        f"covers the head completely. Everything else must remain completely "
        f"unchanged from @Video 1: all body movements and actions, clothing, "
        f"scene layout, background, lighting effects, original audio, video "
        f"duration, and camera movement. Only the head of <Subject 1> is "
        f"covered. Do not add, remove, or alter any other element."
    )
    return SubjectReplacementPrompt(text=text, variant="face_swap_mask_v1")


def masked_swap_prompt(
    *,
    subject_video_desc: str,
    image_desc: str = "",
    extra_notes: str = "",
) -> SubjectReplacementPrompt:
    """Stage 3 base prompt: fill the white mask from the reference.

    Port of build_base_swap_prompt. This is the text the prompt LLM rewrites
    in stage 2; it is also the fallback when the LLM is unavailable or returns
    something unusable, so it has to stand on its own.
    """
    if not subject_video_desc:
        raise ValueError("subject_video_desc is required")
    img_hint = f" ({image_desc})" if image_desc else ""
    text = (
        f"Define {subject_video_desc} in @Video 1 as <Subject 1>; the face to "
        f"apply to <Subject 1> is the face in @Image 1{img_hint}. Strictly edit "
        f"@Video 1: the white rectangle in @Video 1 marks where <Subject 1>'s "
        f"head must be replaced. Replace the white rectangle with the face, hair "
        f"and hairstyle from @Image 1, so the head is fully reconstructed with "
        f"the reference identity - face, hairline and hairstyle - and no white "
        f"area remains anywhere in the output. Render it in every frame, "
        f"precisely tracking that subject's head position, size, orientation and "
        f"motion from @Video 1, and blend it naturally with the neck, skin tone "
        f"and lighting of the scene. {_PROPORTION_CLAUSE} Do not modify any "
        f"other person in @Video 1. Everything else must remain completely "
        f"unchanged from @Video 1: all body movements and actions, clothing, "
        f"scene layout, background, lighting effects, original audio, video "
        f"duration, and camera movement. Do not add, remove, or alter any other "
        f"element." + (f" {extra_notes}" if extra_notes else "")
    )
    return SubjectReplacementPrompt(text=text, variant="face_swap_masked_v1")


def subject_replacement_prompt(*, variant: str = "identity_lock") -> SubjectReplacementPrompt:
    """Prompt for replacing only the designated lead in Video 1.

    Asset references are deliberately positional because ModelArk prompts address inputs as
    Video 1, Image 1, and so on. Image 1 should be a frontal close-up and Image 2 an optional
    full-body reference of the same authorized person.
    """
    variants = {
        "identity_lock": (
            "Edit Video 1. Replace only the lead character visible in Video 1 with the same "
            "authorized person shown in Image 1 and, when supplied, Image 2. Preserve that "
            "person's facial identity consistently in every frame, including eye shape, nose, "
            "mouth, skin tone, hairline and face proportions. Keep the original performance, "
            "gaze, expression timing, lip movement, body motion, camera movement, framing, "
            "lighting, wardrobe, background, props, other people and shot duration unchanged. "
            "Do not replace or alter any other face. Do not add text, logos, cuts or new objects."
        ),
        "performance_lock": (
            "Edit Video 1 using Image 1 and, when supplied, Image 2 as the identity reference "
            "for the lead character only. Transfer the reference identity while matching the "
            "lead's original head pose, emotion, blinking, lip motion and performance frame by "
            "frame. Preserve the exact composition, camera, timing, body, costume, environment, "
            "other characters and visual style. Change nothing except the designated lead's "
            "identity. No new cuts, text, logos or objects."
        ),
        "continuity_lock": (
            "Perform a restrained identity replacement in Video 1: the lead character becomes "
            "the authorized person in Image 1 and optional Image 2. Maintain one stable identity "
            "through the entire shot with no morphing, flicker, age change, hairstyle drift or "
            "skin-tone drift. Preserve the source shot's action, duration, camera, lighting, "
            "wardrobe, background, props and every non-target person exactly. Do not modify any "
            "other face and do not introduce text, logos, cuts or objects."
        ),
    }
    try:
        return SubjectReplacementPrompt(text=variants[variant], variant=variant)
    except KeyError as exc:
        raise ValueError(f"Unknown prompt variant: {variant}") from exc
