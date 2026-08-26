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
        # 25 August: "the woman in the foreground" described her in none of the
        # shots where she was actually damaged - beside him on a bus seat, or
        # alone in her own close-up - so the model read it as inapplicable and
        # put the subscriber's face on her. She is now identified by what she
        # looks like, and the no-man-in-frame case is stated outright. The
        # wardrobe sentence is here because one batch dressed Arjun in the
        # subscriber's own checked shirt, taken from the reference photo.
        role_render_notes=(
            "Keep his expression, smile and mouth movement exactly as they are in "
            "the source video; do not copy the neutral expression from the "
            "reference image. There is exactly ONE man to change. The young woman "
            "with shoulder-length wavy hair in the olive-green jacket is a "
            "different person: leave her face, hair, body and clothing completely "
            "untouched, and never apply the reference face to her. If a shot "
            "contains no man in a denim shirt, change nothing in that shot at all. "
            "Take ONLY the face from the reference image. Do not take the reference "
            "image's clothing: the man wears a blue denim shirt in every frame and "
            "must keep it. Keep all clothing, the background, camera movement, shot "
            "timing, full duration and the original audio exactly as they are."
        ),
        # A still of the ORIGINAL lead, under the shell's media directory. The
        # face-QA gate needs to know who Arjun was in order to tell a correct
        # swap from one that replaced somebody else (see face_qa.judge_window).
        role_original_portrait="role-original.png",
    ),
)
