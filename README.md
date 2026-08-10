# star.me.hungama.com
This repo is created to manage code base for the Project StarMe managed by Neeraj Sir

## Current implementation

The repository now includes an authenticated synthetic FastAPI/Android vertical slice for the
restricted internal prototype. It supports operator-issued access, device-bound sessions,
catalogue, consent, orders, synthetic render jobs, first-look decisions, revocation/cancellation,
and signed delivery grants. Real identity upload, CineIQ rendering, protected object storage, and
media delivery remain disabled until their approved inputs and infrastructure are available.

The recovered Kotlin/Jetpack Compose v1 application is sanitized under [`android/`](android/).
It provides the inherited v1 experience plus authenticated remote API integration. The current APK
was rebuilt from this adapted source rather than copied from the ZIP's prebuilt APK. Its UI remains
largely inherited and is not a finished creative-product design.
Generated builds, APKs, local machine configuration and episode MP4s are not stored in Git.

The reported RMX3782 selfie exit was reproduced as a shutter/system-navigation overlap, not a process
crash. The camera is now inset-safe, lifecycle-cleaned and visibly reports readiness/errors; the
installed correction passed two consecutive captures. A first cinematic redesign pass updates the
shared palette, backdrop, StarME chrome, cards, CTA system, opening and camera. Wider device,
accessibility, usability and full-journey acceptance remain; do not describe this build as release-ready.

`StarME_Demo.html` remains a standalone visual demo; it is not connected to this API.

## Local backend setup

Requirements: Python 3.11+ and, for the proposed full local stack, Docker Compose.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
cp .env.example .env
docker compose up -d postgres redis
alembic upgrade head
uvicorn starme.main:app --reload
```

The local API documentation is available at `http://127.0.0.1:8000/docs`. Never enable sensitive
processing or replace placeholder configuration until the matching approvals and controlled
infrastructure are recorded.

The synthetic vertical slice includes single-use tester access, authenticated consent/orders,
first-look approval/retake, Redis/RQ job contracts, revocation cancellation and signed delivery
grants. See [API v1](Docs/API/StarME_API_v1.md).

The backend capability response is the source of truth for the consent version. Android also
persists the active local/remote order identifiers, allowing an authenticated production or premiere
journey to recover after process death. The Android persistence source package is version-controlled;
root-local runtime directories remain excluded with anchored `/data/` and `/storage/` ignore rules.

The guarded Seedance operator path supports authentication checks, controlled 2-to-15-second shot
extraction, explicit billable rendering, original-audio remuxing and structural quality gates. See
the [Seedance proof runbook](Docs/Runbooks/StarME_Seedance_Proof_Runbook.md). A real-human proof still
requires a BytePlus `Active` authorized/trusted asset; the ModelArk API key alone does not create it.

For an Android emulator build against the local API:

```bash
cd android
./gradlew -PSTARME_API_BASE_URL=http://10.0.2.2:8000 testDebugUnitTest lintDebug assembleDebug
```

## Verification

```bash
ruff check backend
ruff format --check backend
mypy backend/starme
pytest --cov=starme --cov-report=term-missing
```

## Project documentation

- [Director Decision and Input Request 001](Docs/Decisions/StarME_Director_Decision_Request_001.md)
- [Director Decision Response 001](Docs/Decisions/StarME_Director_Decision_Response_001.md)
- [Project Handover](Docs/Handover/StarME_Project_Handover.md)
- [Provider-neutral foundation ADR](Docs/Architecture/ADR-001-provider-neutral-foundation.md)
- [Traceability register](Docs/Traceability/StarME_Traceability_Register.md)
- [Synthetic staging deployment runbook](Docs/Deployment/StarME_Staging_Runbook.md)
- [Seedance proof runbook](Docs/Runbooks/StarME_Seedance_Proof_Runbook.md)
