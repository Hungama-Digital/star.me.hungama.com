from dataclasses import dataclass


@dataclass(frozen=True)
class SubjectReplacementPrompt:
    text: str
    variant: str


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
