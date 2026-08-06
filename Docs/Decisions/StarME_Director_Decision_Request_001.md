# StarME Director Decision and Input Request 001

**Status:** Awaiting director responses

**Prepared for:** Director review

**Prepared by:** Amol / Engineering

**Date:** 6 August 2026

**Sources reviewed:** `FastME_StarME_Product_Note.docx`, `StarME_Internal_Prototype_Build_v2_1.md`, and its matching PDF

**Purpose:** Reconcile the product roadmap with the internal prototype handoff and close the minimum decisions needed to begin implementation

**Confidentiality:** Strictly confidential - internal use only

---

## 1. Engineering understanding

StarME is the recommended feature brand under FastME for a personalised Micro Drama experience. The long-term product allows an eligible subscriber to complete verified capture and consent, select a story and package, and receive episodes in which they appear as the lead.

The immediate engineering handoff is narrower: a private Android prototype for adult internal testers. A tester should enter through controlled access, complete a simulated subscription, capture one selfie, sign consent, select one of two real Micro Dramas and one designated role, approve a personalised first look, and receive three personalised episodes for streaming and download.

The prototype's proposed technical path is:

```text
Android app
  -> private FastAPI backend
     -> PostgreSQL
     -> Redis + RQ
        -> company-controlled GPU worker
           -> protected object storage
              -> short-lived signed playback/download URLs
```

Path A is the required prototype path: local frame-level face transfer using the approved CineIQ stack, while retaining the original episode audio. Seedance or another partner path is an independent validation track and must not block the local prototype unless the Director explicitly changes this priority.

---

## 2. Direction already present in the documents

These points do not need to be rediscovered. They only need confirmation where the production roadmap and prototype scope differ.

- Use **StarME** as the working brand under FastME, subject to Trilegal trademark clearance before public use.
- The production product is subscription-led and uses a credit/package model.
- Indicative production packages are Cameo (1 episode), Lead Debut (3), Season Star (5), and Superstar (10), with the prices stated in the Product Note.
- Love Story and Action Drama are the recommended first two concepts.
- Production safety principles include own-face-only capture, no minors, auditable and revocable consent, Personal Dignity review, provenance/watermarking, and a misuse/takedown route.
- Production Phase 1 retains the original character voice. Any ElevenLabs/voice feature is later and requires separate consent.
- The internal build uses Android, FastAPI, PostgreSQL, Redis/RQ, protected media storage, and a company-controlled GPU worker.
- Five adult internal testers are the acceptance cohort.
- The internal prototype is private. It does not authorize public launch, real payments, children, open registration, voice cloning, partner data transfer, or production retention.

---

## 3. P0 decisions and inputs

Please respond in the last column. A short answer such as **Approve recommended default**, a name/date, or a link is sufficient.

| ID | Decision or input required | Recommended default | Director / owner response |
|---|---|---|---|
| ST-P0-01 | Which document is the canonical implementation authority? The prototype filename says `v2_1`, its heading says Version 2.0, and the Product Note defines a broader gate plan. | Record the current internal prototype as **Build Specification 2.1** and treat it as Amol's implementation scope; retain the Product Note as the production roadmap. | Pending |
| ST-P0-02 | Is Amol assigned to the three-week prototype (two shells, three episodes each), the Product Note Gate 1 demo (one shell, one episode, five users in two weeks), or both? | Amol owns the three-week internal prototype. Gate 1 evidence is produced from its first working shell; it is not a separate build. | Pending |
| ST-P0-03 | Confirm the responsibility split because the Product Note names Kunal for Product, Dheeraj for the orchestrator, and Sanjeev/Sonia for shells, while the prototype is handed to Amol. | Amol: application/backend integration; Kunal: product decisions; Dheeraj: render/CineIQ technical owner; Sanjeev/Sonia: content and dignity review; Nitin/Trilegal: legal. Name one Sprint Commander. | Pending |
| ST-P0-04 | May the internal prototype temporarily use five named adults, signed consent and a visible watermark without production liveness, automated age assurance, C2PA, invisible watermark, QA console, or takedown automation? | Yes, only on company-controlled systems for named adult testers. These production controls remain mandatory gates before any external beta. | Pending |
| ST-P0-05 | Confirm the first two actual shells and supply at least three approved episode masters per shell. | Love Story and Action Drama, portrait, dialogue-forward, 60-120 seconds per episode. | Pending |
| ST-P0-06 | For each shell, identify the one performer/role to replace, provide 5-10 approved reference stills and personalised poster base art, and name the content owner. | One designated role per shell; no multi-person replacement in this prototype. | Pending |
| ST-P0-07 | Provide written authority to alter the designated performer's likeness in each shell and identify the rights approver. | No shell is ingested until its rights reference and Personal Dignity approval are recorded. | Pending |
| ST-P0-08 | Provide access to the exact approved CineIQ face-transfer code, model/checkpoint files, reproducible environment instructions, and technical owner. | Dheeraj/CineIQ supplies a local CLI or container and confirms model licensing for this internal use. | Pending |
| ST-P0-09 | Confirm the GPU host: India/company-controlled location, GPU/VRAM, OS, CUDA, storage, SSH access, and availability window. | Linux host, 24 GB or more VRAM, NVENC FFmpeg support, and at least 500 GB protected working storage. | Pending |
| ST-P0-10 | Approve prototype consent text, signature method, revocation route, retention/deletion period, and Legal/business owner. | Drawn signature plus typed name; immediate processing block on revocation; deletion after a short approved prototype window. Legal must supply exact wording and duration. | Pending |
| ST-P0-11 | Confirm the five adult testers, Android device coverage, APK distribution method, and private backend access route. | Named adults only; company-controlled signed APK; TLS backend limited to an approved office/VPN/private route. | Pending |
| ST-P0-12 | Name the final go/no-go approver and screening date. | Director owns final outcome; CineIQ owner signs off likeness quality; screening occurs at the end of Week 3. | Pending |

---

## 4. P1 defaults Engineering can use

These do not need to delay scaffolding. Please identify only exceptions.

| ID | Implementation default | Director / owner exception |
|---|---|---|
| ST-P1-01 | Simulated subscription only; no payment gateway, invoice, or external subscription API. | None / Pending |
| ST-P1-02 | Display only the Lead Debut three-episode package in the prototype. Production tiers and indicative prices stay documented but are not transacted. | None / Pending |
| ST-P1-03 | Capture guidance requires one adult face, good light, no mask/glasses, and no other people; server rejects zero or multiple faces. | None / Pending |
| ST-P1-04 | CineIQ supplies one approved first-look frame per shell rather than selecting it dynamically. | None / Pending |
| ST-P1-05 | Watermark: `StarME - AI personalised - Internal preview`, persistent in a safe lower corner. | None / Pending |
| ST-P1-06 | RQ queue; one full render at a time; first-look jobs have priority. | None / Pending |
| ST-P1-07 | Protected S3-compatible object storage; stream URL 15 minutes and download URL 30 minutes. | None / Pending |
| ST-P1-08 | Operator-issued, single-use tester/device code; no open registration. | None / Pending |
| ST-P1-09 | Retry infrastructure failures once; operator-only manual rerender; retain failure reason in the audit event. | None / Pending |
| ST-P1-10 | Similarity scores are telemetry during the prototype; human screening is the release authority. | None / Pending |
| ST-P1-11 | Prototype targets: first look under two minutes and three episodes under one hour on the approved GPU. The production 12-hour promise is a separate future SLA. | None / Pending |
| ST-P1-12 | Prepare only a provider interface for Seedance/partner Path B. Send no identity or confidential media externally without a separate recorded approval and data review. | None / Pending |

---

## 5. Protected handoff checklist

Each selected shell needs the following protected package:

```text
{shellId}/
  shell.json
  rights-confirmation.pdf-or-email
  dignity-approval.pdf-or-email
  reference/{roleId}/01.jpg ... 10.jpg
  episodes/ep01.mp4 ... ep03.mp4
  first_look_frame.jpg
  poster_base.jpg
```

`shell.json` should identify the shell title, palette, enabled role, source filenames, episode order, first-look frame, package mapping, and rights/dignity references.

Transfer media, performer references, rights records, selfies, signatures, embeddings, model weights, and secrets only through approved company-controlled storage. None of these items belongs in Git.

---

## 6. Proposed delivery sequence after P0 closure

### M0 - Intake and reproducibility

- Build the existing Android prototype or confirm that a clean client must be created.
- Reproduce the approved CineIQ CLI/model environment on the GPU.
- Validate shell assets, checksums, rights, and dignity approvals.

### M1 - Real catalogue and backend, Days 1-3

- FastAPI, PostgreSQL, Redis/RQ, and protected object-storage skeleton.
- Migrations, audit events, controlled tester entry, simulated wallet, and signed-consent record.
- Real catalogue metadata with a stub worker and Android API integration.

### M2 - Face-transfer path, Days 3-8

- One tester, one approved role, and one episode end to end.
- Character-only replacement, tracking/restoration, original audio, and visible watermark.
- Phone-screen review before expansion to the second shell.

### M3 - Queue, first look, and delivery, Week 2

- Priority first-look and full-render jobs.
- Approve/retake flow, episode status, signed stream/download, and cost/performance telemetry.

### M4 - Internal screening, Week 3

- Five named adult testers across two shells and three episodes each.
- Consent revocation, cancellation, and deletion verification.
- Director/CineIQ screening with numbered corrections and go/no-go decision.

---

## 7. Acceptance record

For every tester and shell, record:

- designated performer only was replaced;
- original audio remains intact;
- flicker, seams, occlusion failure, or identity drift;
- first-look and complete-order times;
- stream and download success;
- poster and watermark correctness;
- consent reference, revocation, and deletion result;
- render duration, GPU time, and rerender count; and
- human outcome: accept, rerender, or reject.

The M4 decision must be one of:

1. Path A approved for continued internal productisation;
2. Path A approved with numbered corrections; or
3. no-go pending content, model, legal, or infrastructure changes.

This outcome does not authorize public launch, external beta, real payments, minors, voice cloning, partner processing, or production retention.

---

## 8. Director response summary

Please return:

1. answers to ST-P0-01 through ST-P0-12;
2. any exception to the P1 defaults;
3. links/owners for the protected Android, content, CineIQ, and GPU handoffs; and
4. the target internal screening date.

Once these are available, Engineering can begin M0/M1 immediately and treat missing M2 media/model inputs as explicit blockers rather than inventing them.
