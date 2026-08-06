# StarME Traceability Register

**Last updated:** 6 August 2026

| Ref | Requirement / decision | Current implementation | Verification | Status / blocker |
|---|---|---|---|---|
| ST-P0-01..12 | Director decisions | Recorded in Director Decision Response 001 | Response-to-request reconciliation | Approved; protected delivery inputs tracked separately |
| ST-P1-06 | Redis/RQ queue | Separate first-look and full-render queues; inline synthetic test adapter | Workflow tests and Compose review | Synthetic implementation complete; real worker pending CineIQ |
| ST-P1-07 | Protected storage and signed URLs | Purpose-bound 15-minute stream/preview and 30-minute download grants | End-to-end delivery-grant test | Contract implemented; real object adapter pending server storage |
| ST-P1-12 | Provider interface for Path B | Generic render-provider protocol | Provider unit test | No external transfer implemented |
| Safety-01 | No sensitive processing before approval | Three-part capability gate; disabled defaults | API and configuration tests | Implemented foundation |
| Safety-02 | No protected assets in Git | Ignore rules and documented repository boundary | Git status / secret review | Ongoing control |
| Data-01 | Canonical metadata and audit store | PostgreSQL models for access, sessions, consent, orders, jobs, first looks, episodes and audit | Alembic upgrade through `20260806_0002` | Synthetic workflow implemented |
| API-01 | Provider-neutral application contract | Authenticated catalogue, consent, order, job, first-look, revocation and delivery APIs | 13 backend tests, 96% coverage | Synthetic workflow implemented |
| Android-01 | Android application | Inherited v1 Compose experience plus tester gate, bearer session, remote consent/order/status/first-look/revocation and signed URL integration | Kotlin compile, 2 contract tests, lint, debug APK assembly, install and cold-launch check on Realme RMX3782 | P0 blocked: user-reported selfie failure; full device workflow not tested; UI is not product-acceptance-ready |
| Android-02 | Reliable guided selfie capture | Inherited CameraX capture and ML Kit single-face check | Source audit and attempted RMX3782 use | P0 blocked: failure reported; no StarME fatal trace retained; reproduce, instrument, harden and device-test |
| Product-01 | Premium, engaging creative experience | Inherited v1 theme/screens provide scaffolding | No formal design review, usability study or accessibility acceptance yet | M1.5 redesign and product acceptance required before internal release |
| Deploy-01 | Restricted staging deployment | Non-root API image, isolated PostgreSQL/Redis/API/RQ Compose topology, Nginx and TLS | Compose validation, migration head, live/ready checks, trusted external HTTPS check, authenticated catalogue smoke test | Active at `https://starme.hungama.com`; Legal consent version and device acceptance pending |
