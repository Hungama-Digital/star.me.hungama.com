# StarME Private Prototype API v1

**Status:** Synthetic workflow implemented; real sensitive processing disabled by default
**Date:** 6 August 2026

## Authentication

An operator issues a named tester code through `POST /v1/operator/access-codes` using the private
operator key. The Android app redeems it once with an app-scoped random device binding through
`POST /v1/access/redeem`. The returned 12-hour bearer token is stored on device, excluded from
backup, and only a keyed digest is stored by the backend.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health/live` | Process liveness |
| GET | `/health/ready` | Database readiness |
| GET | `/v1/capabilities` | Enabled/disabled processing capabilities plus the server-approved consent version/status |
| POST | `/v1/operator/access-codes` | Issue a single-use tester code |
| POST | `/v1/access/redeem` | Bind code to device and create session |
| GET | `/v1/catalogue/shells` | Authenticated synthetic catalogue |
| POST | `/v1/consents` | Create server consent reference |
| DELETE | `/v1/consents/{reference}` | Revoke, request deletion and cancel active work |
| POST | `/v1/orders` | Create consent-bound Lead Debut order |
| GET | `/v1/orders/{id}` | Poll order, job, first-look and delivery state |
| POST | `/v1/orders/{id}/first-look` | Approve first look or require retake |
| GET | `/v1/media/{key}` | Validate purpose-bound expiring delivery grant |

## State flow

`QUEUED → FIRST_LOOK_RENDERING → AWAITING_FIRST_LOOK`

- `RETAKE` produces `RETAKE_REQUIRED` and no full-render job.
- `APPROVE` produces `FULL_RENDERING → READY` in the synthetic adapter.
- Revocation produces `CANCELED` for active orders and jobs.

## Queue and delivery defaults

- `starme-first-look`: priority first-look jobs.
- `starme-full-render`: one full-render worker queue for the prototype.
- Local tests use an inline adapter; Compose deployment uses Redis/RQ.
- Stream/preview grants expire after 15 minutes.
- Download grants expire after 30 minutes.
- The synthetic media endpoint validates grants but intentionally returns no real media payload.

Android must obtain `consent_version` from `/v1/capabilities`; it must not bake a Legal or staging
version into the APK. A null version means consent submission is unavailable and the client fails
closed. `legal_text_status` distinguishes configured server wording/version from the pending state.

## Safety boundary

When sensitive processing is disabled, order creation accepts only `synthetic-*` face asset
references. Real upload, object storage and CineIQ adapters remain blocked until their protected
handoffs and controlled infrastructure are configured.
