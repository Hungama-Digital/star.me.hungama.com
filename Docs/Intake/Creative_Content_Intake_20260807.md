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

---

# Second drop - 7 August 2026 (Dipti_2)

**Source:** `/Users/amoldewase/Downloads/Dipti_2/` (extracted locally to `Dipti_2/extracted/`;
nothing committed to Git)

## Inventory

| Item | Contents | Assessment |
|---|---|---|
| `episodes-...zip` (617 MB) | **Episode masters:** `EP 1 - Wrong Ride.mp4` (74.4 s), `EP 2 - Asmaan Se Gire.mp4` (78.6 s), `EP 3 - Saath Milkar.mp4` (107.0 s) | All 1080x1920 vertical H.264 with AAC audio; EP1/EP2 at 24 fps, EP3 at 23.976 fps. This satisfies the minimum three-master requirement for the first shell |
| `characters-...zip` (23 MB) | Show character sheet stills: Arjun (3), riya (3), Commander (3), plus 6 unlabelled `kling`/`ELEMENTS` images that appear to be the demo-swap subject | 3 stills per role is progress but below the 5 to 10 required for the designated role |
| `posters-...zip` (4 MB) | Two finished 1080x1920 posters with the title baked in, plus a separate show logo PNG | Usable catalogue/premiere art; a text-free base was requested, but the separate logo makes compositing workable |
| `Script-...zip` | `Short Synopsis.docx` and full episode scripts for all 11 episodes | Confirms the show: **"Ek Love Story Aisi Bhi"**, an 11-episode Hinglish sci-fi rom-com (runaway couple accidentally shuttled to Mars). Episode slate matches the 11-episode appearance log and screengrabs from the first drop |

Both drops describe the same single show. Concept assignment: Love Story (with a sci-fi premise).

## Neeraj Sir's email decisions (recorded separately)

`Docs/Decisions/StarME_Neeraj_Sir_Email_Decisions_20260807.md` records: (1) the show and demos were
not produced on CineIQ, CineIQ access is pending via Madhav, and outward branding may call it a
CineIQ production while technical records stay accurate; and (2) an explicit override to run the
demo with this one show only, with more shows added over time.

## Remaining gaps after both drops

1. Designated replaceable role in writing (Arjun remains the evident candidate).
2. 5 to 10 reference stills for that designated role (currently 3 per character).
3. Designated first-look frame, or confirmation Engineering may choose from screengrabs.
4. Completed `shell_template.json` metadata.
5. Rights-or-fully-synthetic confirmation email per ST-P0-07.
6. CineIQ CLI/checkpoints and GPU host (Dheeraj/Madhav) - now the primary M2 blocker.
7. Legal consent wording/version (Nitin) - still blocks Step 3 on device.

---

# Third drop - 7 August 2026 (Dipti_3) and answers to open questions

**Source:** `/Users/amoldewase/Downloads/Dipti_3/` (local, controlled; not committed to Git)

## Inventory

| Item | Contents | Assessment |
|---|---|---|
| `Arjun (1).zip` | `Arjun_01`..`Arjun_06` (six clean single-face frontal close-ups with varied expressions: neutral, smiling, sad, laughing) plus earlier Arjun sheets and a source image | Satisfies the 5 to 10 reference-still requirement for the designated role |
| `Riya.zip` | `Riya_01`..`Riya_08` plus profile/close-up stills | Full reference set for Riya (not the designated role, but useful) |
| `shell.docx` | The filled `shell_template.json` | Title "Ek Love Story. Aisi Bhi", synopsis, `fully_synthetic: "true"`, characters (arjun replaceable, riya not), EP1 duration 1:14, poster base named, first-look = screenshots. A few TO-FILL fields remain (shell_id, concept enum, role_id/display, master filenames, resolution) but all are known to Engineering |

## Dipti's answers to the four open questions

1. **First-look frame:** use screengrabs (Engineering may choose).
2. **Reference stills:** two folders shared (Arjun 6, Riya 8), clearing the 5 to 10 requirement.
3. **Fully synthetic confirmation:** "yes these characters are fully synthetic" - this is the
   ST-P0-07 legal tick for a fully synthetic shell (no performer, no rights record required). Also
   stated as `fully_synthetic: "true"` in `shell.docx`.
4. **Designated replaceable role:** **Arjun**, AI generated, confirmed in writing.

## Content blocker status after three drops

All creative inputs for the one approved show are now in hand:

- episode masters EP1 to EP3 (1080x1920, audio) - from Dipti_2;
- designated role Arjun, confirmed in writing;
- six clean Arjun reference close-ups;
- first-look frame source (screengrabs) and poster base;
- fully-synthetic confirmation (ST-P0-07 satisfied); and
- shell metadata (mostly complete).

**Content is no longer the blocker.** The remaining hard blocker for a real personalised demo is the
render engine itself: CineIQ CLI/container plus checkpoints and a CUDA-capable GPU host. Per Neeraj
Sir, CineIQ team access is still pending (Madhav to action) and the current AIStaging server has no
GPU. Those are ST-P0-08/09, owned by Dheeraj and Madhav.
