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
