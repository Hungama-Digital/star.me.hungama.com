import pytest

from starme.prompts import face_swap_prompt, subject_replacement_prompt


def test_face_swap_prompt_carries_the_proven_recipe() -> None:
    prompt = face_swap_prompt(
        subject_video_desc="the young man in the dark blue denim shirt (Arjun)",
        image_desc="the man facing the camera",
        extra_notes="Do not modify the woman in the foreground.",
    )
    assert prompt.variant == "face_swap_direct_v1"
    text = prompt.text
    assert text.startswith("Strictly edit @Video 1.")
    assert "the young man in the dark blue denim shirt (Arjun)" in text
    assert "(the man facing the camera)" in text
    # The liveliness fix: expression must follow the video, not the photo.
    assert "do not copy the neutral expression" in text
    # The proportion clause that prevents oversized faces.
    assert "must not be larger, smaller, or misaligned" in text
    assert text.endswith("Do not modify the woman in the foreground.")


def test_face_swap_prompt_requires_subject_description() -> None:
    with pytest.raises(ValueError):
        face_swap_prompt(subject_video_desc="")


def test_legacy_variants_still_resolve() -> None:
    assert subject_replacement_prompt(variant="identity_lock").variant == "identity_lock"
    with pytest.raises(ValueError):
        subject_replacement_prompt(variant="nope")
