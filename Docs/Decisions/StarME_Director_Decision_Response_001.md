# StarME Director Decision Response 001

**Status:** Issued and closed. All P0 items answered.
**In response to:** StarME Director Decision and Input Request 001, 6 August 2026
**Issued by:** Director's office
**Date:** 6 August 2026
**Confidentiality:** Strictly confidential, internal use only

Engineering may begin M0 and M1 immediately on the basis of this response. The three items marked CONFIRM are being closed by the Director directly and do not block scaffolding.

---

## 1. P0 responses

| ID | Response |
|---|---|
| ST-P0-01 | **Approve recommended default.** The internal prototype document is recorded as Build Specification 2.1 and is Amol's implementation authority. The Product Note remains the production roadmap. Where they conflict, 2.1 governs the prototype. |
| ST-P0-02 | **Approve recommended default.** Amol owns the three-week internal prototype. Gate 1 evidence is produced from its first working shell. There is no separate Gate 1 build. |
| ST-P0-03 | **Approve the split as stated:** Amol on application and backend integration; Kunal Arora on product decisions; Dheeraj Goel as render and CineIQ technical owner; Dipti (Head, AI Studio) with Prabhakar on content and dignity review; Nitin Goel with Trilegal on legal. Sprint Commander: **Madhav.** Amol transitions standup command to Madhav immediately; Madhav runs the house cadence (9 AM and 6 PM, ten minute hard cap) and owns blocker escalation from day one. |
| ST-P0-04 | **Yes, approved.** Named adult internal testers, signed consent and visible watermark only, on company-controlled systems. Production liveness, automated age assurance, C2PA, invisible watermarking, QA console and takedown automation are waived for this prototype and remain mandatory gates before any external exposure. |
| ST-P0-05 | **Confirmed: Love Story and Action Drama.** Portrait, dialogue-forward, 60 to 120 seconds per episode, minimum three approved masters per shell. Content owner: Dipti, Head of AI Studio, with Prabhakar. A structured content brief accompanies this response. |
| ST-P0-06 | **Approve recommended default.** One designated role per shell, no multi-person replacement. The AI Studio to designate the role, supply 5 to 10 approved reference stills and poster base art per shell; Dipti is the named content owner. |
| ST-P0-07 | **Approve recommended default.** No shell is ingested without a recorded rights confirmation and Personal Dignity approval. Rights approver: Nitin Goel, on written confirmation supplied by Dipti as content owner (not required for fully synthetic shells with no underlying performer). One email per shell is sufficient at prototype stage. |
| ST-P0-08 | **Approved.** Dheeraj Goel supplies the approved CineIQ face-transfer stack as a local CLI or container with checkpoint files and reproducible environment instructions, and confirms model licensing covers this internal use. Dheeraj is the technical owner of this input. |
| ST-P0-09 | **Approved in principle; CONFIRM host details.** Dheeraj to allocate from existing company-controlled GPU capacity in India: Linux, 24 GB or more VRAM, NVENC-capable FFmpeg, CUDA, at least 500 GB protected working storage, SSH access for Amol. Dheeraj to send host particulars and availability window directly to Amol. |
| ST-P0-10 | **Approve recommended default.** Drawn signature plus typed name; immediate processing block and queued-job cancellation on revocation; retention limited to the prototype window plus 30 days, then deletion; deletion on request at any time. Nitin to issue the exact consent wording; a working draft is being supplied to Nitin so this closes within days, not weeks. |
| ST-P0-11 | **Approved.** Company-signed APK, operator-issued single-use tester codes, TLS backend restricted to office network or VPN. The five named adult testers: **Dipti, Prabhakar, Srivatsa, Raunaq and Neeraj.** |
| ST-P0-12 | **Confirmed.** The Director is the final go/no-go approver. Likeness quality sign-off at screening: Dipti on craft with Dheeraj Goel on technical quality. Screening: **Tuesday 25 August 2026**, with the product complete and stable by **Sunday 23 August 2026**. This compresses the plan by roughly half a week; see the pacing note below. |

---

## 2. P1 defaults

**No exceptions.** All twelve P1 defaults (ST-P1-01 through ST-P1-12) are approved as written. Two are singled out for emphasis rather than change: ST-P1-10, human screening remains the release authority and similarity scores stay telemetry; and ST-P1-12, no identity or confidential media leaves company-controlled systems without a separate recorded approval and data review.

---

## 3. Handoff owners

| Handoff | Owner | Action |
|---|---|---|
| Shell packages per Section 5 checklist (masters, references, first-look frame, poster base, rights and dignity records) | Dipti, AI Studio | Assemble and place in approved protected storage; due Monday 10 August |
| CineIQ face-transfer CLI or container, checkpoints, environment | Dheeraj Goel | Deliver with reproducibility notes direct to Amol |
| GPU host and access | Dheeraj Goel | Host particulars and SSH access to Amol |
| Consent wording and retention text | Nitin Goel with Trilegal | Approve or amend the supplied working draft |
| Existing Android v1 client, build pack and manifests | Director's office | Already in Amol's possession per the v2.1 handoff; confirm no clean rebuild is required (M0 first check) |

---

## 4. Pacing note: compressed schedule

All P0 items are closed; nothing awaits confirmation. The screening date of 25 August with product-ready on 23 August shortens the original three-week plan by roughly half a week. Directed adjustments:

1. M0 and M1 run concurrently and complete by **Monday 10 August**.
2. M2, the face-transfer path, is the critical path and gets the compression protection, not the cut: first swapped episode reviewed on a phone screen by **Friday 14 August**.
3. M3, queue, first look and delivery, completes by **Wednesday 19 August**.
4. M4 tester runs execute **20 to 22 August**, leaving 23 and 24 August for corrections before the 25 August screening.
5. Consequence of compression: shell packages from the AI Studio and the CineIQ CLI plus GPU host from Dheeraj are due by **Monday 10 August**, not within five working days. Any input arriving later moves M2 day for day and is escalated by Madhav the same day.

M2 media and model inputs remain explicit blockers if late, exactly as Section 8 of the request proposed.
