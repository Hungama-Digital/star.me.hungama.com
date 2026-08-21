import pytest

from starme.prompts import face_swap_prompt, subject_replacement_prompt


def test_face_swap_prompt_is_verbatim_run_a() -> None:
    notes = (
        "Keep his expression, smile and mouth movement exactly as they are in "
        "the source video; do not copy the neutral expression from the "
        "reference image. Do not modify the woman in the foreground in any way."
    )
    prompt = face_swap_prompt(
        subject_video_desc="the young man in the dark blue denim shirt (Arjun)",
        image_desc="the man facing the camera",
        extra_notes=notes,
    )
    assert prompt.variant == "face_swap_direct_v2"
    text = prompt.text
    # Byte-faithful to Face Swap Studio's build_direct_swap_prompt.
    assert text.startswith(
        "Strictly edit @Video 1. Define the young man in the dark blue denim "
        "shirt (Arjun) in @Video 1 as <Subject 1>; replace <Subject 1>'s face "
        "with the face in @Image 1 (the man facing the camera). Apply each "
        "reference face in every frame"
    )
    # The liveliness fix rides in the notes, exactly as in the approved run.
    assert "do not copy the neutral expression" in text
    assert "must not be larger, smaller, or misaligned" in text
    assert text.endswith("Do not modify the woman in the foreground in any way.")


def test_face_swap_prompt_requires_subject_description() -> None:
    with pytest.raises(ValueError):
        face_swap_prompt(subject_video_desc="")


def test_legacy_variants_still_resolve() -> None:
    assert subject_replacement_prompt(variant="identity_lock").variant == "identity_lock"
    with pytest.raises(ValueError):
        subject_replacement_prompt(variant="nope")
