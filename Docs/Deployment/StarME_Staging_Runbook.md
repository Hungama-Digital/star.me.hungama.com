# StarME Synthetic Staging Deployment Runbook

**Status:** Prepared; server reachable, SSH authentication and TLS particulars pending

**Scope:** Internal synthetic workflow only. This runbook does not authorize personal data,
protected content, CineIQ assets, external processing, or public access.

## Required operator inputs

- SSH username and matching private-key authentication route;
- DNS name or approved temporary HTTPS endpoint;
- inbound firewall/reverse-proxy arrangement; and
- Legal-approved consent version identifier for the Android consent/order test.

Never place SSH keys, passwords, tokens, `.env`, certificates, or protected media in Git or chat.

Received infrastructure checkpoint (6 August 2026): private IP `10.0.0.63`, public IP
`49.248.193.9`, and SSH port 22 reachable on both from the development Mac. The supplied RSA public
key fingerprint is `SHA256:vcCiN0r9F+Uo02mMC11eZfT8q2SIoJFnWQUZijDSNbM`; its matching private key
is not present or loaded locally. The SSH username, DNS/TLS endpoint, and approved consent version
remain required. The public key body is not stored in Git.

## Server prerequisites

- Docker Engine with Compose v2;
- sufficient disk for container images, PostgreSQL, and Redis;
- ports 80/443 exposed only through the approved TLS reverse proxy; and
- API, PostgreSQL, and Redis ports kept loopback/internal-only.

GPU/CUDA is not required for this synthetic staging milestone.

## Deployment configuration

Create a server-local `.env` from `.env.example`. At minimum set:

```dotenv
STARME_ENVIRONMENT=staging
STARME_QUEUE_BACKEND=rq
STARME_RENDER_PROVIDER=stub
STARME_STORAGE_BACKEND=memory
STARME_ALLOW_SENSITIVE_PROCESSING=false
STARME_OPERATOR_API_KEY=<strong-unique-secret>
STARME_TOKEN_HASH_PEPPER=<independent-strong-secret>
STARME_DELIVERY_SIGNING_KEY=<independent-strong-secret>
STARME_PUBLIC_API_BASE_URL=https://<approved-host>
STARME_APPROVED_CONSENT_VERSION=<legal-approved-version>
```

Generate each secret independently using an approved secrets manager or a cryptographically secure
generator. Do not reuse the PostgreSQL password or commit the resulting file.

The current Compose file contains local-only PostgreSQL credentials. Replace them through a
server-local Compose override or secret-backed deployment configuration before a remote deployment.

## Deploy and verify

From an authorized checkout of the published feature branch:

```bash
docker compose config
docker compose build --pull
docker compose up -d postgres redis
docker compose run --rm api alembic upgrade head
docker compose up -d api worker
docker compose ps
curl --fail --silent --show-error https://<approved-host>/health/live
curl --fail --silent --show-error https://<approved-host>/health/ready
```

Do not expose port 8000 directly to the internet. Terminate TLS at the approved reverse proxy and
forward only to `127.0.0.1:8000`.

## Android internal build

Build only after the HTTPS endpoint is available:

```bash
cd android
./gradlew --no-daemon --no-configuration-cache \
  -PSTARME_API_BASE_URL=https://<approved-host> \
  testDebugUnitTest lintDebug assembleDebug
```

Distribute the debug APK only through the approved internal channel. Do not commit it.

## Acceptance flow

1. Issue one access code through the protected operator endpoint.
2. Redeem it once from the intended device; confirm reuse fails.
3. Create consent and a synthetic order.
4. Poll until the first look is ready.
5. Exercise both retake and approval paths.
6. Poll until the synthetic order is ready and inspect signed grants.
7. Revoke consent during a separately queued order and confirm cancellation.
8. Confirm expired, altered, or wrong-purpose signed grants are rejected.
9. Record results in the handover and traceability register.

## Rollback

Stop application traffic first, then stop API and worker containers. Preserve PostgreSQL and audit
data unless the approved retention/deletion owner authorizes removal. Never delete volumes as a
routine rollback action.
