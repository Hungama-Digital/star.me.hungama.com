# StarME Project Handover

**Handover status:** Ready for a new development chat

**Last updated:** 6 August 2026

**Project owner / director:** Neeraj Sir

**Engineering contact:** Amol

**Repository:** `https://github.com/Hungama-Digital/star.me.hungama.com.git`

**Working branch:** `staging`

**Local checkout:** `/Users/amoldewase/Documents/StarME`

**Confidentiality:** Strictly confidential - internal use only

---

## 1. Purpose of this document

This file is the canonical context handover for continuing StarME engineering in a new Codex, Claude, or developer chat. Read this file and the linked decision request before proposing or implementing work.

It records:

- what StarME is;
- the difference between the production vision and immediate prototype;
- what has and has not been built;
- the proposed architecture and delivery milestones;
- decisions and protected inputs still required;
- repository and security boundaries; and
- the safest next actions.

Do not infer that VerSelf decisions, infrastructure, credentials, deployment configuration, or code apply to StarME. These are separate projects and repositories.

---

## 2. Repository boundary

| Project | Repository | Branch / rule |
|---|---|---|
| StarME | `Hungama-Digital/star.me.hungama.com.git` | Perform StarME work on `staging` unless Amol explicitly directs otherwise. |
| VerSelf | `Hungama-Digital/verself.hungama.com.git` | Do not place StarME code or documents here. Its existing workflow remains independent. |

Never copy code, secrets, databases, personal data, or deployment assumptions between these projects merely because they are managed in the same workspace.

---

## 3. Source material reviewed

### In the StarME repository

- `FastME_StarME_Product_Note.docx` - the broad product vision, commercial model, trust principles, ownership suggestions, and gated roadmap.
- `StarME_Demo.html` - an existing visual/demo artifact. It is not evidence of a production architecture.
- `Docs/Decisions/StarME_Director_Decision_Request_001.md` - the prepared reconciliation questions and recommended defaults for the Director.

### Original handoff material outside the repository

- `StarME_Internal_Prototype_Build_v2_1.md`
- `StarME_Internal_Prototype_Build_v2_1.pdf`

The internal files were reviewed to prepare the decision brief. Do not copy confidential source documents, content masters, performer materials, model weights, or rights records into Git without explicit authorization.

---

## 4. Product understanding

StarME is the recommended feature brand under the FastME umbrella for hyper-personalised Micro Dramas. The subscriber becomes the lead character in a story rather than merely choosing an ending.

The intended production journey is broadly:

1. eligible subscriber enters through a subscription gate;
2. completes guided capture, liveness/identity checks, and consent;
3. chooses a Micro Drama concept and episode package;
4. receives personalised content in which only the authorized subscriber is substituted;
5. receives a poster, first look, episodes, and sharing/delivery experience; and
6. retains revocation, privacy, provenance, and misuse protections.

The Product Note recommends:

- StarME as the working name, subject to trademark clearance;
- Love Story and Action Drama as the first concepts;
- Cameo (1 episode), Lead Debut (3), Season Star (5), and Superstar (10) as indicative production packages;
- original character audio for Phase 1;
- separate consent for any later voice capability;
- own-face-only use, no minors, revocable consent, dignity review, provenance, and takedown protections; and
- progressive gates from internal proof through closed beta and eventual launch.

These are product-roadmap directions, not authorization to launch publicly or implement every production feature in the first prototype.

---

## 5. Immediate internal prototype

The current handoff describes a narrower, private Android prototype for five named adult internal testers.

Expected user journey:

1. install an internal Android APK;
2. enter using controlled tester/device access;
3. complete a simulated subscription;
4. capture one valid selfie;
5. sign an approved consent record;
6. select one of two real Micro Dramas and one designated role;
7. choose a simulated three-episode package;
8. receive a personalised poster and first-look frame;
9. approve the first look or retake the identity capture;
10. receive three personalised episodes; and
11. stream and download the results through protected URLs.

Prototype target proposed in the handoff:

- two shells;
- at least three episodes per shell;
- one replaceable role per shell;
- five adult internal testers;
- first look in approximately two minutes;
- complete three-episode order within approximately one hour on the approved GPU; and
- original audio retained with a visible internal AI-personalisation watermark.

The Product Note also describes a Gate 1 target of one shell, one episode, and five users in two weeks. The Director must reconcile this with the three-week/two-shell prototype handoff.

---

## 6. Proposed technical architecture

```text
Android application
  -> private FastAPI API
     -> PostgreSQL (canonical metadata, consent references, jobs, audit events)
     -> Redis + RQ (prototype job queue)
        -> company-controlled Linux GPU worker
           -> approved CineIQ/local face-transfer pipeline
           -> OpenCV/FFmpeg processing and original-audio remux
           -> visible internal watermark
     -> protected S3-compatible object storage
        -> short-lived signed stream/download URLs
```

### Required Path A

Path A is a local, frame-level face-transfer pipeline using the approved CineIQ stack. Only the designated performer is replaced. The original audio remains unchanged.

### Deferred Path B

Seedance or another external partner route is a separate validation path. At most, define a provider interface until a later approval. Do not transfer a selfie, biometric artifact, episode master, performer reference, or other confidential material to an external provider without a separately recorded data/security/legal decision.

---

## 7. Proposed data domains

The detailed schema is not yet implemented, but the first backend should anticipate:

- named internal testers and single-use access codes;
- devices and sessions;
- consent versions, signatures/references, revocation, and deletion state;
- shells, roles, episodes, asset checksums, and rights/dignity references;
- simulated packages, wallet entries, and orders;
- identity captures and protected derived artifacts;
- first-look and full-render jobs;
- episode outputs and signed-delivery grants;
- render metrics, failure reasons, and rerender attempts; and
- immutable or append-only audit events for sensitive actions.

PostgreSQL should be the canonical metadata and audit store. Object storage contains protected media; Git contains neither personal nor production media.

---

## 8. Safety and data rules

These boundaries apply unless a new written decision changes them:

- adults only for the internal prototype;
- own-face-only capture;
- one designated replaceable role per shell;
- explicit approved consent before order creation or processing;
- immediate processing block/cancellation following revocation;
- protected, company-controlled storage and compute;
- short-lived signed media URLs;
- no open registration or public release;
- no real payment processing;
- no voice cloning in the prototype;
- no external partner processing by default;
- no secrets in Git; and
- no selfies, signatures, embeddings, performer references, episode masters, rights documents, model/checkpoint files, or rendered personal media in Git.

Production controls such as liveness, automated age assurance, C2PA, invisible watermarking, QA tooling, takedown automation, and production retention remain required before external use unless the Director and relevant owners formally decide otherwise. The narrower prototype exception itself is still pending approval in `ST-P0-04`.

---

## 9. Current repository status

As of this handover:

- the repository is checked out locally on `staging`;
- the existing repository contains a README, HTML demo, and Product Note;
- the Director decision request has been created and pushed;
- no Android application architecture has been adopted or implemented by this handover work;
- no FastAPI/PostgreSQL/Redis/object-storage backend has been implemented;
- no render worker or CineIQ integration has been implemented;
- no StarME infrastructure has been provisioned or deployed;
- no confidential content/model package has been added; and
- no production or tester personal data has been processed.

Important prior commit:

- `db9eadf` - Add StarME director decision request.

Do not describe the current HTML demo as a completed app or backend.

---

## 10. Pending Director decisions

The canonical response document is:

`Docs/Decisions/StarME_Director_Decision_Request_001.md`

Its P0 items cover:

1. canonical specification/version;
2. Amol's assigned gate and scope;
3. Product, engineering, content, legal, and Sprint Commander ownership;
4. approval of the restricted internal-prototype safety exception;
5. the two actual shells and episode masters;
6. designated roles, reference stills, poster art, and content owner;
7. substitution rights and dignity approval;
8. approved CineIQ code, models, environment, and owner;
9. GPU host and access;
10. consent, revocation, retention, deletion, and legal owner;
11. five adult testers, Android coverage, APK distribution, and network route; and
12. final go/no-go owner and screening date.

The P1 table contains implementation defaults that need only exceptions. Do not silently treat a P0 recommendation as an approved decision.

---

## 11. Protected inputs required

For each selected shell, Engineering expects an approved protected handoff similar to:

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

Separately required:

- Android v1 repository/build instructions, if a usable client exists;
- approved CineIQ CLI/container, code, checkpoints, licensing confirmation, and environment instructions;
- company-controlled GPU specifications and access;
- approved prototype consent and retention language; and
- named testers and device matrix.

These must be transferred through controlled storage rather than committed to the repository.

---

## 12. Delivery plan

### M0 - Intake and reproducibility

- inspect/build the existing Android client or record that a new client is required;
- reproduce the CineIQ environment on the assigned GPU;
- validate content manifests, checksums, rights, and dignity approvals; and
- record all assumptions and blockers.

### M1 - Backend and real catalogue, Days 1-3

- FastAPI service, PostgreSQL migrations, Redis/RQ, and object-storage adapter;
- controlled tester access, simulated wallet/package, and consent record;
- catalogue/shell APIs and audit events;
- stub render worker that proves queue and delivery contracts; and
- Android remote repository/API integration.

### M2 - Face-transfer pipeline, Days 3-8

- one tester, one approved role, one real episode end to end;
- character-only replacement, tracking/restoration, original audio, and watermark;
- metrics and phone-screen review; and
- expansion only after the first result is accepted.

### M3 - First look, queue, and delivery, Week 2

- priority first-look jobs;
- approve/retake interaction;
- full episode status, failure/retry handling, streaming, and download; and
- cost and performance telemetry.

### M4 - Internal screening, Week 3

- five adult testers;
- two shells and three episodes per shell if confirmed;
- consent revocation/cancellation/deletion verification;
- device and quality evidence; and
- Director/CineIQ accept, correct, or no-go outcome.

---

## 13. What can safely begin before all answers arrive

Only reversible, provider-neutral foundations should begin before P0 closure:

- repository hygiene and contribution documentation;
- architecture decision records clearly marked proposed;
- Android/FastAPI workspace scaffolding after confirming whether the v1 Android source will be provided;
- API contract drafts and local test fixtures containing synthetic/non-personal data;
- PostgreSQL migration framework and append-only audit-event pattern;
- interfaces for object storage and render providers;
- automated unit/integration test harnesses; and
- local development setup with example environment files containing placeholders only.

Do not fabricate content rights, consent text, production models, infrastructure access, or Director approval to unblock development.

---

## 14. Recommended first actions in the new chat

1. Read this file completely.
2. Read `Docs/Decisions/StarME_Director_Decision_Request_001.md` completely.
3. Inspect the `staging` branch, working tree, README, Product Note, and HTML demo.
4. Ask Amol whether any Director responses or protected handoff links have arrived since this document was updated.
5. Record received responses in the decision request without overwriting the original questions.
6. If no responses exist, propose and implement only the safe provider-neutral foundation from Section 13 after confirming the Android source situation.
7. Keep a traceability register connecting requirements, decisions, implementation, tests, deferrals, and blockers.
8. Commit and push only explicitly authorized StarME paths to the StarME `staging` branch.

---

## 15. Git working rules

- Confirm the repository is `Hungama-Digital/star.me.hungama.com.git` before every push.
- Work on `staging` unless explicitly instructed otherwise.
- Inspect `git status` and diffs before staging.
- Stage exact intended paths; never stage unrelated files or use broad adds in a mixed worktree.
- Do not commit `.env`, credentials, keys, personal data, confidential media, model weights, generated outputs, or local system files.
- Keep placeholder configuration in `.env.example` when implementation begins.
- Run relevant formatting, tests, migration validation, and secret checks before pushing.
- Record meaningful implementation changes in the handover/traceability documents.

---

## 16. New-chat bootstrap prompt

Paste the following into the new StarME chat:

> We are continuing the StarME project in the repository `https://github.com/Hungama-Digital/star.me.hungama.com.git`, branch `staging`, with the local checkout at `/Users/amoldewase/Documents/StarME`. StarME and VerSelf are separate projects; never place StarME work in the VerSelf repository. First read `Docs/Handover/StarME_Project_Handover.md` and `Docs/Decisions/StarME_Director_Decision_Request_001.md` completely, then inspect the repository and current Git status. Treat the Product Note as the broader production vision and the internal prototype handoff as proposed immediate implementation scope, subject to the pending P0 reconciliation decisions. Preserve the documented privacy, rights, consent, and repository boundaries. Tell me the recovered current state, ask whether new Director responses or protected handoffs have arrived, and recommend the safest next milestone. Do not begin public deployment, real biometric processing, external partner transfer, or confidential media ingestion without the documented approvals.

---

## 17. Handover maintenance

Update this file whenever any of the following materially changes:

- Director or Legal decisions;
- ownership or milestone scope;
- chosen Android/backend architecture;
- content/model/infrastructure availability;
- implemented features and test coverage;
- deployment environment;
- privacy, consent, retention, or rights controls; or
- active blockers and next milestone.

Use dated entries or a traceability register so later chats can distinguish confirmed decisions from historical proposals.
