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
    ),
)
