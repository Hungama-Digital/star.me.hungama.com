# Creative Content Intake - 7 August 2026 (Dipti / AI Studio)

**Source:** `/Users/amoldewase/Downloads/Dipti/` (local, controlled; none of these assets are
committed to Git per Safety-02)

**Received from:** Dipti's team (AI Studio), the content owner named in ST-P0-05/06

**Status:** First partial shell handoff received ahead of the Monday 10 August deadline. Useful and
substantial, but it is not yet the complete protected shell package defined in Handover Section 11.

---

## 1. Inventory

| Item | Contents | Assessment |
|---|---|---|
| `Character Sheets-...zip` (45 MB) | 7 character turnaround sheets (front/back/close-up on neutral grey): Arjun, Riya, Commander, Riya's Father (all marked "Main Character"), Arjun's Mother, Goon, Astronaut | High-quality identity references; characters appear fully synthetic (AI-generated), which if confirmed engages the ST-P0-07 synthetic-shell clause (no performer rights confirmation required) |
| `Screengrabs-...zip` (642 MB) | 242 PNG stills across Episode 1 to Episode 11 folders (8 to 33 per episode), vertical cinematic frames | Confirms one drama of 11 episodes exists; usable for first-look frame and poster candidates, but stills are not renderable masters |
| `Character_Appearance_Documentation.xlsx` | Per-episode timecoded log of every on-screen character appearance, Episodes 1 to 11, with per-character appearance counts | Directly supports the render pipeline's "identify only the designated character" step and role-selection decisions; timecodes indicate episodes run roughly 45 seconds to 1:42 |
| `originalvideo.mp4` / `swappedface.mp4` | 5.9 s, 1920x1080 landscape, audio; same scene before/after face swap (masked-hero at a metro station) | Face-swap pipeline proof pair 1: swap quality is reviewable frame by frame |
| `originalvideo 1.mp4` / `swapped.mp4` | 10 s, 1080x1920 vertical original with audio; swapped output is 4.5 s, 490x850, 60 fps, **no audio track** (astronaut scene) | Face-swap pipeline proof pair 2; the swapped output's reduced resolution, shorter duration and missing audio show the demo pipeline does not yet meet the original-audio-remux and full-resolution requirements |

## 2. What this tells us

- The AI Studio has one drama substantially assembled (11 episodes documented with stills and
  appearance logs) and a working face-swap capability demonstrated on two scenes.
- Character universe: Arjun and Riya are the leads; Commander, Riya's Father, Arjun's Mother, Goon
  and Astronaut are supporting. The appearance log makes Arjun (appears in every episode, usually
  the most appearances) the strongest candidate for the designated replaceable role, but that is
  the AI Studio's call under ST-P0-06, not Engineering's.
- Episode structure matches the Product Note's micro-drama shape (portrait, roughly 60 to 120
  seconds per episode).
- The demo swap outputs prove capability but also demonstrate the exact gaps the M2 pipeline must
  close: full source resolution, complete duration, original audio remux, and the internal
  watermark.

## 3. Gaps against the Section 11 protected handoff

Still required before M2 can run one real episode end to end:

1. **Episode masters** - full-length MP4s (at minimum ep01 to ep03 of this drama); only stills and
   two short demo clips were received.
2. **Designated replaceable role** - a recorded designation (one role per shell per ST-P0-06).
3. **Per-role reference set** - 5 to 10 approved reference stills for the designated role; the
   single turnaround sheet per character may contribute but does not satisfy the count.
4. **Text-free vertical poster base art** and a designated **first-look frame** per shell.
5. **`shell.json`** metadata (or equivalent) naming the shell, roles and episode list.
6. **Rights/dignity record** - either Dipti's written confirmation that the shell is fully
   synthetic (which waives performer rights under ST-P0-07) or the rights confirmation plus
   Personal Dignity approval; one email per shell suffices at prototype stage.
7. **The second shell** - the Director confirmed two concepts (Love Story and Action Drama); only
   one drama's material has arrived, and its concept assignment should be confirmed.
8. Confirmation of **which pipeline produced the demo swaps** (CineIQ or otherwise) - the CineIQ
   CLI/checkpoints and GPU host remain Dheeraj's separate deliverables (ST-P0-08/09).

## 4. Handling rules applied

- Nothing from this folder is committed to Git; this document records the inventory only.
- The material should move from `~/Downloads/Dipti` to the approved protected storage location
  once one is designated.
- No selfie, tester, or personal data is present in the received material.
