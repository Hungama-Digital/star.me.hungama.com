# StarME temporary consent test exception - 7 August 2026

**Status:** ACTIVE on staging only. Temporary. Must be replaced before any wider test or launch.
**Authorised by:** Neeraj Sir (Director), relayed by Amol in chat on 7 August 2026.
**Basis:** Handover Section 12 "Temporary internal test exception" and ST-P0-04 (Director may approve
the restricted internal-prototype exception).
**Confidentiality:** Strictly confidential, internal use only.

## What was changed

On the staging server `.env` (`/home/hungama/apps/starme/.env`, mode 0600, not in Git) the previously
empty `STARME_APPROVED_CONSENT_VERSION` was set to `development-placeholder-v1`, the exact version the
Android client sends. The `api` and `worker` containers were recreated to pick it up. A prior copy was
saved as `.env.bak-20260807`.

Before: `POST /v1/consents` failed closed with HTTP 503 "Legal-approved consent version is not
configured". After: the same request returns HTTP 201 and records a consent reference, allowing the
on-device journey to proceed past Step 3.

## Guardrails kept in place

- **Staging only.** Production is unaffected.
- **`STARME_ALLOW_SENSITIVE_PROCESSING` remains `false`.** Orders accept only `synthetic-*` face
  assets; no real selfie, biometric, embedding, or identity asset is uploaded, processed, or stored.
- Rendering and storage remain synthetic (`stub` / `memory`).
- Resulting consent records are **non-production** and are tied to the placeholder version string, so
  they are distinguishable and invalidatable.

## Mandatory follow-up

- This is NOT Legal approval. When Nitin/Trilegal issue the final wording and a stable version
  identifier, set that value, and invalidate/replace all `development-placeholder-v1` consent records
  before any wider test or launch.
- Rollback is one step: set `STARME_APPROVED_CONSENT_VERSION=` (empty) in the server `.env` and
  recreate `api` + `worker`; the gate returns to failing closed.
