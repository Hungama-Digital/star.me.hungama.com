# StarME Demo Runbook

**For:** Neeraj Sir's demo (with team)
**Date prepared:** 08/08/2026
**Build:** StarME debug APK, points at `https://starme.hungama.com`
**Confidential | Hungama Digital Media Entertainment Pvt. Ltd.**

---

## 1. One-line framing (say this up front)

"StarME turns a subscriber into the lead of a Micro Drama. What you will see is the full experience,
running live on a phone against our platform. The final piece, swapping the subscriber's face into
the episodes with our CineIQ engine, is the next integration."

## 2. Before the demo (checklist)

- [ ] Latest APK installed on the demo phone (the one built 08/08/2026 with auto-advance + retry).
- [ ] Phone on a **stable network** (prefer mobile data or a known-good Wi-Fi). Confirm by opening
      `https://starme.hungama.com/health/ready` in the phone browser; it should show `status: ok`.
- [ ] A **fresh, unused access code** ready (see Section 5). Have one spare.
- [ ] App freshly launched to the opening screen. If a previous run is in progress, reinstall or use
      Settings to reset, and redeem a fresh code.
- [ ] Volume up (episodes have audio).

## 3. The happy path (exact tap sequence)

1. **Opening screen** ("Your face. Your story. Your premiere.") - tap **Start your debut**.
2. **Membership** - tap **Subscribe - Rs 499 and claim credits**.
3. **Your close-up** - tap **Take selfie** (front camera) or **Upload photo**. Capture a clear,
   front-facing single face. Wait for the four checks to go green ("Verified - this face is yours").
4. Enter a **name** (appears in the billing), then tap **Continue to consent**.
5. **Consent** - tick both boxes, **sign with a finger** in the box. It submits automatically and
   moves on. (If it ever shows "couldn't reach", tap **Try again**; see Section 6.)
6. **Concept** - choose **Ek Love Story Aisi Bhi**, then the role **Arjun**. Tap **Continue**.
7. **Package** - choose **Lead Debut** (3 episodes). Tap **Confirm**.
8. **In production** - the screen now **auto-advances**: it shows the **First Look** on its own.
   Tap **Approve**. It then moves to the premiere by itself (no Refresh tapping needed).
9. **Premiere** - the personalised **poster with the subscriber's name**, the **First Look**, and the
   **three episodes** play. Scroll to stream each; downloads work too.

## 4. Talk-track: what is real vs what is coming (be confident, stay honest)

- **Real and live now:** the entire journey on a real phone against the live platform; on-device
  face and age checks; consent recorded per order; the personalised **poster and First Look** showing
  the subscriber; real episode playback of the actual show; revocation and deletion controls.
- **The one line to keep ready:** "The in-episode face-swap is the final piece, our CineIQ engine,
  landing next. Today the episodes play the base cut; the poster and First Look already show the
  subscriber." Only volunteer this if asked, or use it when moving into episode playback.
- Do **not** claim the subscriber's face is already in the episode video. It is not yet.

## 5. Access codes

Single-use, device-bound, valid ~24 hours. Issue fresh ones the morning of the demo (Engineering /
Amol runs the operator command). Redeem the code once on the demo phone at the opening screen.

- Code 1 (primary): __________________
- Code 2 (spare): __________________

If a code shows "expired/invalid", it usually means the phone briefly lost the server; check the
network (Section 2) and use the spare.

## 6. If something goes wrong (fallbacks)

- **Step 3 "We couldn't reach StarME":** tap **Try again** (the app now retries automatically first).
  If it persists, switch the phone to mobile data and retry. This is connectivity, not a StarME fault.
- **Stuck on "In production":** it should auto-advance; if the network stalls, tap **Refresh
  production status** once to nudge it.
- **Code rejected:** use the spare code; if both fail, Engineering issues a new one in seconds.
- **Worst case:** have a **screen recording** of a clean run on the phone as a backup to play.

## 7. What to say if asked about timelines

Platform and full journey are built and demoable now. Next: CineIQ engine + GPU access (for the real
face-swap) and the final Legal-approved consent wording, then the five-tester internal screening
targeted for **25/08/2026**. See the one-page Release Notes for the leadership summary.
