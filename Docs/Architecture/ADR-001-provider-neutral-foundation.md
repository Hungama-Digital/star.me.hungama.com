# ADR-001: Provider-neutral prototype foundation

**Status:** Proposed, safe to implement before P0 closure

**Date:** 6 August 2026
**Decision scope:** Reversible application foundation only

## Context

The Director decisions, protected Android source, approved content, CineIQ package, GPU host,
and Legal-approved consent and retention language have not yet been supplied. Engineering needs
a foundation that proves application contracts without processing personal or confidential data.

## Decision

- Use a modular FastAPI application with PostgreSQL as the canonical future metadata store.
- Use Alembic for migrations and an append-only `audit_events` table as the first persistent domain.
- Keep object storage and rendering behind typed provider interfaces.
- Configure both providers as fail-closed and disabled by default.
- Require an explicit sensitive-processing switch *and* configured storage/render providers before
  sensitive capabilities can report as enabled.
- Expose only health, capability, and clearly labelled synthetic catalogue endpoints initially.
- Retain Redis/RQ as the proposed prototype queue, but do not enqueue real jobs until approvals and
  the provider contract are available.
- Do not adopt an Android architecture until existing Android source/build instructions are supplied
  or Amol confirms that a new client should be created.

## Consequences

The backend can be developed and deployed for non-sensitive health and contract testing. It cannot
accept selfies, signatures, biometric derivatives, protected episode assets, or real render jobs.
Enabling these paths requires a later ADR tied to recorded P0 decisions and protected handoffs.
