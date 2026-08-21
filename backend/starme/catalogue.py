from starme.schemas import SyntheticShell

# The catalogue metadata describes the real first show per Neeraj Sir's 7 August
# one-show override. Rendering, storage and delivery remain synthetic fixtures,
# so synthetic_fixture stays True until the real pipeline is enabled.
SYNTHETIC_SHELLS = (
    SyntheticShell(
        id="ek-love-story-001",
        title="Ek Love Story Aisi Bhi",
        concept="love_story",
        enabled_role="arjun",
        episode_count=3,
        role_character="Arjun",
        # Verbatim from the product-approved 20 August dashboard run.
        role_video_desc="the young man in the dark blue denim shirt (Arjun)",
        role_render_notes=(
            "Keep his expression, smile and mouth movement exactly as they are in "
            "the source video; do not copy the neutral expression from the "
            "reference image. Do not modify the woman in the foreground in any "
            "way. Keep the denim shirt, all clothing, the background, camera "
            "movement, shot timing, full duration and the original audio exactly "
            "as they are."
        ),
    ),
)
