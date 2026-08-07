# StarME Project Handover

**Handover status:** Ready for a new development chat; camera defect fixed, broader Android acceptance remains open

**Last updated:** 6 August 2026

**Project owner / director:** Neeraj Sir

**Engineering contact:** Amol

**Repository:** `https://github.com/Hungama-Digital/star.me.hungama.com.git`

**Base branch:** `staging`

**Implementation branch:** `codex/authenticated-prototype-foundation` (created for the 6 August foundation publication)

**Local checkout:** `/Users/amoldewase/Documents/StarMe 2`

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

### Executive status at this checkpoint

StarME currently has a functional synthetic backend/deployment foundation and an Android engineering
prototype. It does **not** yet have a fully acceptance-tested consumer experience. The reproduced
selfie exit was caused by the shutter overlapping the Realme system navigation area; the inset-safe
camera redesign is installed and two consecutive captures now pass on RMX3782. A first cinematic
visual pass is also installed. Continue M1.5 device-matrix, usability, and full-journey acceptance
before making the real CineIQ pipeline the main workstream.

### Current checkpoint in one view

| Area | Where it stands now |
|---|---|
| Git | Latest implementation commit before this handover update: `cbc94be`; branch `codex/authenticated-prototype-foundation`, based on `staging` |
| Staging API | Live at `https://starme.hungama.com`; health/readiness and authenticated catalogue checks passed |
| Backend | FastAPI/PostgreSQL/Redis/RQ synthetic workflow supports access, sessions, catalogue, consent/order contracts, jobs, first look, retake, revocation/cancellation and signed grants |
| Android | Adapted v1 source plus authenticated backend workflow and first cinematic redesign pass; HTTPS debug APK installed on Realme RMX3782 |
| Camera | Apparent crash reproduced as OEM navigation overlap, fixed, and verified with two consecutive captures on RMX3782 |
| Step 3 | Intentionally blocked because the staging server has no Legal-approved consent version configured; details in Section 12 |
| Rendering | Synthetic stub only; no CineIQ, protected shell media, real identity upload, protected object storage or real delivered video |
| Product readiness | Engineering prototype, not release-ready; complete journey, device matrix, accessibility and observed usability acceptance remain |

### What is safe to demonstrate today

- install and launch the internal debug application;
- use an unexpired operator-issued single-use code and device-bound session;
- browse the redesigned opening and the synthetic catalogue;
- complete simulated subscription and guided selfie/ML Kit single-face capture; and
- exercise backend health, authentication and catalogue contracts.

The normal device journey currently stops at server-side consent creation in Step 3. Do not bypass
that boundary silently or present synthetic rendering/delivery as the real product pipeline.

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

### Intended experience standard

This is a creative entertainment product, not an API demonstration. A tester should feel invited into
a premium cinematic experience: playful, confident, visually distinctive, safe, and easy to
understand. Capture and consent must feel reassuring rather than technical; render waiting should
build anticipation; first look should feel like a reveal; and recovery from permission, camera,
network, or processing failures must be graceful.

The first redesign pass now provides a new palette, ambient background, StarME brand chrome, refined
cards/CTAs, a premiere-led opening and a guided close-up camera. Other screens still substantially
use v1 information architecture and components. No formal end-to-end product-design acceptance,
usability study, accessibility pass, or complete motion/design-system exercise has been completed.

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

The current synthetic backend implements the following canonical records; sensitive-media fields
and production governance metadata must be added when their approved inputs arrive:

- single-use access codes and device-bound sessions;
- consent references, versions, revocation, and deletion scheduling;
- synthetic catalogue shells, roles, episodes, and packages;
- orders, first-look/full-render jobs, first looks, and episode outputs; and
- append-only audit events for security- and workflow-relevant actions.

Not yet implemented are identity-asset storage, protected asset manifests/checksums,
rights/dignity records, payment/wallet ledgers, render telemetry, and production deletion workers.

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

Production controls such as liveness, automated age assurance, C2PA, invisible watermarking, QA tooling, takedown automation, and production retention remain required before external use. The Director approved the narrower named-adult internal-prototype exception in `ST-P0-04` on 6 August 2026.

---

## 9. Current repository and delivery status

As of this handover:

- the repository base is `staging`; the implementation is being preserved on
  `codex/authenticated-prototype-foundation`;
- the existing repository contains a README, HTML demo, and Product Note;
- the Director decision request has been created and pushed;
- the recovered Kotlin/Jetpack Compose v1 app is sanitized under `android/` for API adaptation;
- a FastAPI/PostgreSQL/Redis provider-neutral foundation is implemented locally;
- synthetic first-look and full-render RQ jobs are implemented; no CineIQ integration exists;
- an isolated synthetic staging stack is deployed on the shared AIStaging server;
- no confidential content/model package has been added; and
- no production or tester personal data has been processed.

Foundation update, 6 August 2026:

- a provider-neutral FastAPI backend foundation is present on the local `staging` worktree;
- health/readiness, capability discovery, and synthetic catalogue contracts are implemented;
- PostgreSQL/Alembic configuration and an initial append-only audit-event migration are present;
- Redis/RQ queues and synthetic first-look/full-render jobs are implemented; real CineIQ jobs are
  not enabled;
- object-storage and render-provider protocols fail closed through disabled adapters;
- sensitive capabilities remain disabled by default and require an explicit processing switch plus
  configured providers;
- automated lint, strict typing, and unit/API tests are present;
- `Docs/Architecture/ADR-001-provider-neutral-foundation.md` records the proposed decision; and
- `Docs/Traceability/StarME_Traceability_Register.md` records implementation and blockers.

The Director response is now recorded. Android-to-API integration is implemented and the HTTPS build
was installed and cold-launched on a physical Realme RMX3782 against the staging API. That check did
not exercise the complete user journey. A subsequent user attempt to take a selfie appeared to exit;
targeted reproduction established that the camera shutter overlapped the system navigation target and
sent the app to the background. The corrected build passed two consecutive captures on that device.
This foundation is not yet a fully acceptance-tested app, production deployment,
approved Legal consent implementation, biometric pipeline, protected storage adapter, or CineIQ
integration.

Important prior commit:

- `db9eadf` - Add StarME director decision request.

Do not describe the current HTML demo as a completed app or backend.

### APK and Android-source lineage

The installed build is **not** a copied copy of either prebuilt APK found inside `StarMe.zip`:

- the ZIP was inspected as an Android source/build pack;
- source was sanitized and imported under `android/` while generated builds, APKs, media, and local
  configuration were excluded;
- authentication, session persistence, remote API repositories, order/job polling, first-look,
  revocation, and signed-delivery integration were added to that source; and
- a new debug APK was compiled locally against `https://starme.hungama.com` and installed with a new
  development signature after Amol authorized removal of the signature-incompatible old app.

It nevertheless looks similar to the uploaded v1 app because the majority of its Compose UI and
creative language remain inherited. Backend wiring changed substantially; the consumer-facing design
has not yet been substantially redesigned.

### What is inherited versus newly implemented

| Area | Inherited from Android v1 pack | Added/adapted in this workstream |
|---|---|---|
| Experience | Compose screens, theme, simulated subscription, capture/gallery UI, signature, catalogue, poster/premiere presentation | Tester access gate, remote-state/error handling needed for API workflow |
| Device features | CameraX selfie, ML Kit single-face check, Room, Media3, WorkManager | Staging endpoint build configuration and authenticated session storage |
| Workflow | Local fake billing/render and bundled demo progression | Server consent/order contracts, polling, first-look approve/retake, revocation and delivery grants |
| Platform | No remotely deployed StarME service | FastAPI, PostgreSQL, Redis/RQ, migrations, synthetic worker, Nginx/TLS staging deployment |

No real selfie upload, real biometric/identity-asset storage, CineIQ render, protected media object
storage, or payment integration exists yet.

---

## 10. Director decisions and remaining delivery inputs

The canonical request and response documents are:

`Docs/Decisions/StarME_Director_Decision_Request_001.md`

`Docs/Decisions/StarME_Director_Decision_Response_001.md`

All P0 decisions and P1 defaults were approved on 6 August 2026. The following are now delivery
inputs rather than open product decisions:

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

### Immediate M1.5 - Product experience and device reliability

This milestone is in progress. The first camera/reliability fix and shared cinematic visual pass are
complete; full device-matrix and observed usability acceptance remain required before making the real
render pipeline the main workstream.

1. Define the primary tester journey and a coherent cinematic visual direction: type, colour, imagery,
   motion, sound policy, tone of voice, component states, and accessibility constraints.
2. Reframe operator-issued access as a discreet internal-test entry rather than a consumer feature.
3. Redesign concept discovery, capture, consent, production progress, first-look approval/retake, and
   premiere as one continuous story rather than a collection of functional screens.
4. Harden capture: permission rationale and denial recovery, automatic continuation after permission,
   front-camera availability, lifecycle-safe bind/unbind, visible loading/readiness, guarded shutter,
   actionable errors, preview confirmation, retake, and upload/retry states.
5. Add structured, privacy-safe diagnostics for permission, camera binding, capture, file handling,
   ML verification, API, and navigation failures. Do not log image contents, paths containing personal
   data, bearer tokens, signatures, or consent artifacts.
6. Add Compose UI/instrumentation coverage for critical states and manually test on the agreed device
   matrix, including clean install, permission allow/deny, repeated capture/retake, background/resume,
   offline/slow network, process restart, and revocation.
7. Run a product/design review and a five-tester observed usability pass; record evidence and defects.

Exit criteria: no P0/P1 crash in the agreed matrix; a new tester can complete the synthetic journey
without engineering guidance; every wait/error/empty state is designed; capture works repeatedly;
accessibility basics pass; and Product/Director accepts the look and emotional quality of the flow.

### Selfie incident and required diagnosis

On 6 August 2026, Amol reported that the installed app failed/exited when he tried to take a selfie.
The retained Android crash buffer contained unrelated crashes from another package and no StarME
`FATAL EXCEPTION`. A controlled reproduction then exposed the cause: on the RMX3782 full-screen
Compose dialog, the visible shutter bounds extended into the three-button navigation bar. A tap at
the shutter centre invoked Home, paused StarME, and detached the camera while leaving the process
alive. This exactly matched the apparent crash.

The corrected implementation keeps the shutter above OEM navigation controls, guards provider and
front-camera availability, performs lifecycle cleanup, disables capture until ready, minimizes
capture latency, continues after permission approval, and surfaces bind/capture errors with
privacy-safe diagnostic logs. Verification on the connected RMX3782 demonstrated two consecutive
captures, the StarME activity remaining foreground, and no fatal exception.

Remaining acceptance work:

1. add automated Compose/instrumentation coverage for camera states and safe touch bounds;
2. prove cancel, retake, background/resume, deny, and permanent-deny cases;
3. repeat on the agreed multi-device/Android-version matrix; and
4. complete the synthetic journey after Legal consent configuration is available.

Until this passes, “APK builds/installs/launches” must never be reported as “selfie flow tested” or
“Android acceptance complete.”

### Step 3 consent gate - current blocking behaviour

Observed Android message: `Consent could not be recorded on the private server.` This wording is a
generic client error; the connection is not failing and “private server” is not itself the problem.

The actual request/response path is:

1. after both boxes are selected and a signature has ink, Android sends `POST /v1/consents`;
2. the current Android request identifies its text as `development-placeholder-v1`;
3. staging/production requires the request version to exactly equal
   `STARME_APPROVED_CONSENT_VERSION`;
4. that server value is intentionally unset while final Nitin/Trilegal-approved wording/version is
   outstanding; and
5. the backend fails closed with HTTP 503 and `Legal-approved consent version is not configured`.

This is an intentional legal/safety control, not a camera, signature-pad, TLS, DNS, authentication or
database defect. It prevents a placeholder screen from being stored as a legally approved consent
record and then attached to rendering orders.

Two explicit ways forward exist:

- **Preferred:** receive final approved consent wording and a stable version identifier, make Android
  display/send that exact version, configure the same identifier in the server-local environment,
  restart only the StarME API/worker if required, and verify the audit record/order linkage.
- **Temporary internal test exception:** an authorized owner may explicitly approve
  `development-placeholder-v1` for named-adult internal testing only. Configure only staging, mark
  resulting records non-production, prohibit real sensitive processing, and replace/invalidate the
  placeholder before any wider test or launch.

Do not set a value merely to make the screen pass, do not commit the server `.env`, and do not imply
that Amol's request to test the app constitutes Legal approval. The Android error mapping was
corrected on 6 August 2026: the client now maps the HTTP 503 consent gate to an honest
"Consent setup is awaiting Legal approval" message, maps 401 to a session-expired prompt, and no
longer shows the misleading generic private-server message for consent or order failures.

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
4. Continue the remaining M1.5 device-matrix and usability acceptance; do not regress the documented
   shutter/navigation-bar fix.
5. Confirm whether final Legal wording/version or an explicit internal-only placeholder exception has
   arrived before changing the Step 3 server gate.
6. Ask Amol whether protected content, CineIQ material or other controlled inputs have arrived.
7. Record received inputs without overwriting their source decisions.
8. Keep a traceability register connecting requirements, decisions, implementation, tests, deferrals, and blockers.
9. Commit and push only explicitly authorized StarME paths. Use a `codex/` implementation branch
   based on `staging` unless Amol explicitly requests direct work on another branch.

---

## 15. Git working rules

- Confirm the repository is `Hungama-Digital/star.me.hungama.com.git` before every push.
- Treat `staging` as the integration base; use a `codex/` feature branch for implementation work.
- Inspect `git status` and diffs before staging.
- Stage exact intended paths; never stage unrelated files or use broad adds in a mixed worktree.
- Do not commit `.env`, credentials, keys, personal data, confidential media, model weights, generated outputs, or local system files.
- Keep placeholder configuration in `.env.example` when implementation begins.
- Run relevant formatting, tests, migration validation, and secret checks before pushing.
- Record meaningful implementation changes in the handover/traceability documents.

---

## 16. New-chat bootstrap prompt

Paste the following into the new StarME chat:

> We are continuing the StarME project in the repository `https://github.com/Hungama-Digital/star.me.hungama.com.git`, based on branch `staging`, with the local checkout at `/Users/amoldewase/Documents/StarMe 2`. First read `Docs/Handover/StarME_Project_Handover.md`, both documents in `Docs/Decisions/`, `Docs/API/StarME_API_v1.md`, and `Docs/Traceability/StarME_Traceability_Register.md` completely; then inspect the current branch and Git status. StarME and VerSelf are separate projects, so never copy code, data, secrets, or deployment assumptions between them. The authenticated synthetic backend and `https://starme.hungama.com` deployment are functional. The Android APK was rebuilt from adapted v1 source and installed on RMX3782. The selfie exit was traced to the shutter overlapping system navigation, fixed and verified with two consecutive captures. A first cinematic redesign covers shared styling, chrome, CTA, opening and guided camera. Step 3 currently fails closed because Android sends `development-placeholder-v1` while staging has no Legal-approved consent version; do not bypass this without final Legal wording/version or an explicitly recorded internal-test exception. Rendering/storage remain synthetic. Continue M1.5 device/usability/full-journey acceptance, preserve privacy/rights/repository boundaries, and never equate compile/install/cold-launch checks with end-to-end acceptance.

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

### 6 August 2026 - provider-neutral foundation started

Amol authorized independent foundation work while Director responses remain pending. Engineering
added the backend, migration, disabled-provider, synthetic-fixture, test, local-service, and
traceability foundations described in Section 9. No protected input was used and no sensitive path
was enabled. The next independent slice can expand the canonical domain model and API contracts
using synthetic data while the Android-source and deployment-host details remain explicit blockers.

### 6 August 2026 - authenticated synthetic vertical slice

The recovered Android v1 source was sanitized into `android/` without APKs, generated output,
local configuration or episode MP4s. The backend and Android client now implement single-use
tester/device access, hashed bearer sessions, authenticated catalogue and consent/order contracts,
synthetic first-look and full-render jobs, first-look approval/retake, revocation with active-job
cancellation, and purpose-bound signed delivery grants. Backend migrations, lint, strict typing and
13 tests pass at 96% coverage. Android Kotlin compilation, two API contract tests, lint and debug APK
assembly pass. Real uploads, protected object storage, shell media and CineIQ remain disabled.

### 6 August 2026 - deployment publication checkpoint

Amol authorized preservation, GitHub publication, and deployment preparation. The intended branch is
`codex/authenticated-prototype-foundation`, based on `staging`. Backend verification passes Ruff,
format checking, strict mypy, 13 pytest tests at 96% coverage, and a clean Alembic upgrade through
`20260806_0002`. Android verification passes two contract tests, `lintDebug`, and `assembleDebug`;
the generated APK remains ignored and is not committed. The repository scan found no tracked APK,
archive, media, keystore, local environment file, or known credential pattern.

The foundation was committed as `39cdf2f` (`Build authenticated StarME prototype foundation`) and
pushed to `origin/codex/authenticated-prototype-foundation`. It has not been merged into `staging`;
future work must inspect the remote branch/PR state before creating another publication branch.

Remote deployment is ready at the code/configuration level but cannot start until Amol supplies the
SSH username and a usable private-key authentication route, application domain or test URL, and
inbound-network/TLS arrangement. Server particulars supplied on 6 August 2026 are private IP
`10.0.0.63` and public IP `49.248.193.9`; SSH port 22 is reachable on both from the current Mac. The
supplied RSA public key has fingerprint `SHA256:vcCiN0r9F+Uo02mMC11eZfT8q2SIoJFnWQUZijDSNbM` and the
SSH username is `hungama`. Non-interactive SSH authentication was tested against both addresses and
failed with `Permission denied (publickey,password)` because no matching private key is
installed/loaded locally. `/Users/amoldewase/Downloads/staging-ai.rsa` was inspected and is an
RFC4716 `SSH2 PUBLIC KEY` export with the same fingerprint, not a private key, so it cannot
authenticate. The public key itself is deliberately not copied into this repository.

The initial deployment remains synthetic: use PostgreSQL,
Redis, API, and RQ worker with `STARME_ENVIRONMENT=staging`, strong unique secrets, stub rendering,
memory delivery, and `STARME_ALLOW_SENSITIVE_PROCESSING=false`. Do not upload selfies, protected
shells, performer media, CineIQ weights, or other sensitive material during this stage.

Read-only server inspection after password-based login confirmed Ubuntu 22.04, 8 CPU cores, 31 GiB
RAM, 131 GiB free disk, Docker 29.1.3, legacy Compose 1.29.2, Nginx/Certbot, and no detected NVIDIA
GPU tooling. The machine is shared and already uses ports 80, 443, 5432, 6379, 8000, and several
application ports. StarME must use Compose project name `starme`, distinct loopback ports (currently
planned as PostgreSQL 55433, Redis 56380, API 8200), and must not alter existing applications. No
StarME DNS record or certificate is available yet, so the first verification should use an SSH
tunnel; Android remote testing waits for approved DNS/TLS.

After the server health check succeeds, build Android with
`-PSTARME_API_BASE_URL=https://<approved-host>` and run the controlled physical-device flow: redeem a
single-use code, create consent/order, poll first look, approve and finish, retake once, revoke, and
confirm queued-job cancellation and subsequent access denial. Legal's approved consent version is
still required for a staging consent/order flow; the backend deliberately fails closed when it is
unset.

### 6 August 2026 - synthetic staging backend deployed

Password-based SSH access as `hungama` was confirmed. The credential was used interactively and was
not written to Git, documentation, shell command arguments, or application configuration. Docker
Compose v2.40.3 was installed alongside the existing legacy Compose installation. No existing
container or Nginx route was changed.

Commit `8b85832` was archived from the verified local branch, transferred to the host, checksum
verified, and extracted to `/home/hungama/apps/starme`. A server-local `.env` (mode `0600`) contains
independently generated staging secrets; its values are not recorded here. The Compose project name
is `starme`, with PostgreSQL at `127.0.0.1:55433`, Redis at `127.0.0.1:56380`, and the API at
`127.0.0.1:8200`. Persistent volumes are `starme_starme_postgres` and `starme_starme_redis`.

The four services `starme-postgres-1`, `starme-redis-1`, `starme-api-1`, and `starme-worker-1` are
running. PostgreSQL and Redis report healthy, Alembic is at `20260806_0002 (head)`, and the RQ worker
listens on `starme-first-look` and `starme-full-render`. Live and ready checks passed locally on the
host and independently through an SSH tunnel from the development Mac. A synthetic operator/access
smoke test returned two authenticated catalogue shells and correctly rejected access-code reuse
with HTTP 401.

This is not a public deployment. There is no StarME DNS/TLS route, all service ports are loopback
only, the approved Legal consent version remains unset, sensitive processing remains false, and
render/storage providers remain synthetic (`stub`/`memory`). The next deployment inputs are an
approved StarME hostname/DNS record and TLS certificate plus Legal's consent version. Only then
should an Android build target the server and physical-device acceptance begin.

Amol subsequently approved `starme.hungama.com` and configured its Route 53 A record to
`49.248.193.9`. Public Google and Cloudflare resolvers both returned that address. The repository
contains an isolated Nginx virtual-host source at `deploy/nginx/starme.hungama.com.conf`; certificate
provisioning and external HTTPS verification were the active next deployment action.

Nginx now proxies `starme.hungama.com` to the loopback StarME API and redirects HTTP to HTTPS.
Let's Encrypt issued a certificate valid from 6 August through 4 November 2026, and the existing
Certbot renewal timer is active. External TLS verification, live/readiness endpoints, and an
authenticated HTTPS catalogue smoke test all pass. The server-local public API base URL is
`https://starme.hungama.com`; no secret values are recorded in Git.

The Android debug application was rebuilt against `https://starme.hungama.com`. Unit tests,
`lintDebug`, and `assembleDebug` passed using the locally cached Gradle 8.14.3 runtime after the
pinned Gradle 8.9 CDN download repeatedly reset. Generated `BuildConfig` confirms the HTTPS URL.
The ignored APK is 62,919,005 bytes with SHA-256
`46f2b27bb327ccfd17137cc4d954a50651d21699f3f85a426c1fcd8658da661e`. The existing AGP 8.5.2
warning for compileSdk 35 remains non-blocking. No physical-device test or APK distribution has
been performed.

Amol explicitly authorized removal of an older `com.hungama.starme.debug` installation whose
development signature did not match the new build. The old app and its local data were removed from
the connected Realme RMX3782, the HTTPS-configured APK was installed successfully, and Android
completed a cold launch of `com.hungama.starme.MainActivity`. The StarME process was live and the
activity was confirmed as the device's foreground activity. Functional tester-code and complete
workflow acceptance on the device remain pending the approved consent version and a controlled
tester session.

### 6 August 2026 - product/QA correction after device use

Amol attempted the selfie path on the installed RMX3782 build and reported that the app crashed or
exited. Earlier verification had established only build, lint, unit-contract checks, install, process
start, and cold launch; it had not tested capture or the complete device journey. The previous
phrasing is corrected by the M1.5 section above. The retained log buffer did not contain a StarME
fatal stack trace, so diagnosis remains open and no speculative root cause or completed fix is
recorded.

The APK was rebuilt from adapted source rather than copied from the ZIP's prebuilt artifacts, but its
creative presentation remains substantially the inherited v1 UI. Product quality therefore requires
a purposeful experience redesign plus camera/reliability work and device acceptance evidence. The
current release classification is: **backend/deployment foundation functional; Android engineering
prototype installed; consumer experience and end-to-end acceptance blocked.**

### 6 August 2026 - selfie root cause fixed and first cinematic redesign installed

Controlled reproduction on RMX3782 established that the apparent crash was an interaction defect:
the full-screen camera dialog placed the shutter over the OEM three-button navigation region. The
shutter centre invoked Home, so StarME paused and the camera detached while its process remained
alive. There was no application fatal exception.

The camera was rebuilt with an OEM-safe bottom touch target, guarded provider/front-camera setup,
lifecycle unbinding, capture-readiness and busy states, low-latency capture, automatic continuation
after permission approval, accessible shutter semantics, explicit recovery UI, and privacy-safe
diagnostic events. The new HTTPS APK was installed over the existing debug build. Its shutter bounds
were verified above the navigation bar, and two consecutive real captures returned to StarME with the
activity foreground and no fatal exception.

The same build introduces the first deliberate product-experience pass: a richer cinematic palette
and ambient background, StarME-first brand chrome, refined cards and CTA geometry, a new premiere-led
opening narrative, and a guided close-up experience. This is a meaningful visual foundation rather
than final design acceptance. Concept, consent, production, premiere, accessibility, motion, device
matrix, and five-tester usability review still require product-led iteration under M1.5.

Verification: `testDebugUnitTest`, `lintDebug`, and `assembleDebug` passed. Installed APK size is
62,990,071 bytes and SHA-256 is
`51160acaf4438f1f9dfa646394588d160a1d0c4de90d595aaea74d8e0d3f89f2`.

### 6 August 2026 - Step 3 consent gate explained

Device testing reached Step 3 and displayed `Consent could not be recorded on the private server.`
Code/configuration tracing confirmed this is the expected fail-closed Legal gate. Android currently
sends consent version `development-placeholder-v1`; the staging server's
`STARME_APPROVED_CONSENT_VERSION` remains unset, so `POST /v1/consents` returns HTTP 503 with
`Legal-approved consent version is not configured`. Connectivity, authentication, signature capture,
TLS and PostgreSQL are not the cause.

Section 12 records the exact behaviour and both controlled resolutions. Preferred resolution is to
use final Nitin/Trilegal-approved wording and one matching version identifier in the displayed Android
content, API request and server-local configuration. A temporary placeholder may be enabled only
after an explicit internal-test exception; it must remain staging-only and must not authorize real
sensitive processing. No server configuration was changed during this diagnosis.

Current immediate sequence: obtain and record the consent decision; improve the Android error copy;
configure and verify Step 3 only when authorized; complete the synthetic on-device workflow; continue
M1.5 product/device acceptance; and integrate protected content/CineIQ only after their controlled
inputs arrive.

### 6 August 2026 - honest Step 3 and order error copy

The misleading `Consent could not be recorded on the private server.` client message was replaced.
Failure mapping now lives in `android/.../state/UserFacingErrors.kt` and is used by the ViewModel for
both consent and order submission:

- consent HTTP 503 (the intentional Legal gate) now reads "Consent setup is awaiting Legal approval,
  so this step is paused for everyone. Your photo and details stay safely on this device. No retake
  is needed once it opens.";
- HTTP 401 on either path prompts for a new access code;
- order HTTP 409 explains that the consent is no longer active; and
- network failures ask the tester to check the connection and retry.

No server configuration changed; the Legal gate itself still fails closed exactly as before. Seven
new unit tests cover the mapping (including asserting the "private server" wording is gone).
`testDebugUnitTest` (9 tests total), `lintDebug` and `assembleDebug` pass. The rebuilt APK has not
yet been installed because no device was connected at build time; install and re-verify Step 3
messaging on RMX3782 when the phone is next attached. Remaining M1.5 work is unchanged: camera
instrumentation coverage, device-matrix acceptance, and the observed usability pass.

### 7 August 2026 - first creative content handoff received

Dipti's team delivered the first partial shell package to local controlled storage
(`~/Downloads/Dipti`): 7 synthetic-looking character turnaround sheets (Arjun, Riya, Commander,
Riya's Father, Arjun's Mother, Goon, Astronaut), 242 vertical screengrabs across 11 documented
episodes, a per-episode timecoded character-appearance spreadsheet, and two before/after face-swap
demo clips proving swap capability on a metro-station scene and an astronaut scene. The second demo's
output is lower resolution, truncated and missing audio, which usefully illustrates the exact M2
requirements still to be met (full resolution, complete duration, original-audio remux, watermark).

This is not yet the complete Section 11 protected handoff. Still required: episode masters, the
designated replaceable role, 5 to 10 reference stills for that role, poster base and first-look
frame, `shell.json`, the rights-or-synthetic confirmation per ST-P0-07, the second shell, and
confirmation of which pipeline produced the demos. Full inventory and gap analysis:
`Docs/Intake/Creative_Content_Intake_20260807.md`. No media was committed to Git.

### 7 August 2026 - episode masters received and one-show override recorded

Dipti's second drop (`~/Downloads/Dipti_2`, kept out of Git) delivers the core of the first shell:
three full episode masters of **"Ek Love Story Aisi Bhi"** (EP1 74 s, EP2 79 s, EP3 107 s, all
1080x1920 H.264 with AAC audio), per-role reference stills (Arjun, Riya, Commander, 3 each), two
finished posters plus a separate logo, and the complete 11-episode script with synopsis. Both drops
describe the same single show; its slate matches the earlier screengrab and appearance-log delivery.

Neeraj Sir's email decisions are recorded in
`Docs/Decisions/StarME_Neeraj_Sir_Email_Decisions_20260807.md`: the material was not produced on
CineIQ (access pending via Madhav; branding may describe it as a CineIQ production while technical
records stay accurate), and the demo proceeds with this one show only under an explicit override,
with more shows to be added over time.

M2's remaining input blockers are now the CineIQ CLI/checkpoints and GPU host, the written role
designation and expanded reference set, the rights-or-synthetic confirmation, and Legal's consent
version for Step 3. The consolidated gap list lives in
`Docs/Intake/Creative_Content_Intake_20260807.md`.

### 7 August 2026 - real show wired into the catalogue

Following Neeraj Sir's one-show override, the catalogue now describes the real first show while all
media, rendering and delivery remain synthetic:

- backend `catalogue.py` exposes a single shell `ek-love-story-001` ("Ek Love Story Aisi Bhi",
  concept `love_story`, enabled role `arjun`, 3 orderable episodes); the second fixture shell was
  removed and `synthetic_fixture` deliberately remains true until the real pipeline is enabled;
- the Android manifest presents "Ek Love Story Aisi Bhi" with the Mars-toned palette, Arjun as the
  single selectable role (provisional pending Dipti's written designation), and the real 11-episode
  slate with true durations for Episodes 1 to 3 (74 s / 79 s / 107 s); "Hukum" and the other
  concepts are marked coming-soon and are not orderable;
- order creation now sends `ek-love-story-001` and the selected role instead of the old
  `synthetic-love-001`/`synthetic_lead` fixtures; and
- no protected media entered Git; episode files remain placeholder references pending signed
  remote delivery.

Verification: backend Ruff, format check, strict mypy and 13 pytest tests at 96% coverage pass
(run on a Python 3.12 environment provisioned via uv because the Mac has no system 3.11+); Android
`testDebugUnitTest` (9 tests), `lintDebug` and `assembleDebug` pass.

**Deployment sequencing:** the staging server still runs commit `8b85832` with the old fixture
catalogue. Deploy the updated backend to `/home/hungama/apps/starme` before installing the new APK,
or on-device orders will fail with `Shell or role is not enabled`. If Dipti designates a role other
than Arjun, update `enabled_role`, the manifest role entry and the ViewModel fallback together.

### 7 August 2026 - on-device verification of the real-show build and copy cleanup

The catalogue/error-copy build was installed on RMX3782 and driven through the journey via adb.
Verified on device: redesigned cinematic opening; Step 1 Membership (₹499/year, ₹ locale); Step 2
guided close-up with photo upload and the ML Kit single-face check passing on a synthetic character
face (no real biometric used); Step 3 consent rendering the full plain-language note, both
checkboxes, and a working finger-signature pad ("Signed on 7 August 2026"). The signature pad sits
at the end of the scrollable Stage and rises above the floating CTA dock once the outer page is
scrolled (the 128dp bottom reserve works); reaching it requires that scroll, which is a minor
usability note for the M1.5 pass rather than a blocker.

The transient HTTP 503 consent snackbar with the new honest wording was not captured as a screenshot
(snackbar timing plus an OEM installer popup interrupted the automated attempts); that specific
503-to-copy mapping remains covered by the 7 `UserFacingErrors` unit tests. Recommend an
instrumentation test for the on-screen message as part of M1.5 rather than relying on manual capture.

Separately, user-facing copy was scanned for em-dashes (an organisation style rule) and cleaned:
`PromoScreen` hero paragraph, both `StarViewModel` face-guidance strings, and the placeholder dashes
in `ProductionScreen`, `SettingsScreen` and `PremiereScreen` (now "pending"/"Not set"). Inherited
KDoc comments still contain em-dashes and were intentionally left untouched to avoid churn.
Android `testDebugUnitTest` (9 tests), `lintDebug` and `assembleDebug` pass; the rebuilt APK was
reinstalled on RMX3782.
