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
| API-01 | Provider-neutral application contract | Authenticated catalogue, consent, order, job, first-look, revocation and delivery APIs | 12 backend tests, 96% coverage | Synthetic workflow implemented |
| Android-01 | Android application | Tester gate, bearer session, remote consent/order/status/first-look/revocation and signed URL integration | Kotlin compile, 2 contract tests, lint and debug APK assembly | Synthetic integration implemented; device test pending |
| Deploy-01 | Private server deployment | Non-root API image and PostgreSQL/Redis/API/RQ Compose topology | Configuration review; SSH port/authentication check | Both supplied IPs reachable on port 22 and username is `hungama`; available local keys are rejected, so matching private key plus DNS/TLS details are pending |
