# StarME Synthetic Staging Deployment Runbook

**Status:** Synthetic loopback deployment active; DNS/TLS and Legal consent version pending

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
key fingerprint is `SHA256:vcCiN0r9F+Uo02mMC11eZfT8q2SIoJFnWQUZijDSNbM` and the SSH username is
`hungama`. Authentication using the private keys currently available on the development Mac fails
against both addresses with `Permission denied (publickey,password)`; the matching private key is
not present or loaded locally. The file `/Users/amoldewase/Downloads/staging-ai.rsa` is the same
RFC4716 public key, despite its filename, and cannot be used for authentication. The DNS/TLS endpoint
and approved consent version also remain required. The public key body is not stored in Git.

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
STARME_POSTGRES_PASSWORD=<url-safe-random-secret>
STARME_POSTGRES_BIND=127.0.0.1
STARME_POSTGRES_PORT=55433
STARME_REDIS_BIND=127.0.0.1
STARME_REDIS_PORT=56380
STARME_API_BIND=127.0.0.1
STARME_API_PORT=8200
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

The example values use local-only ports and credentials. A shared staging host must use a unique,
URL-safe PostgreSQL password and non-conflicting loopback ports as shown above. Compose project name
`starme` keeps container and volume names isolated from other deployments.

## Deploy and verify

From an authorized checkout of the published feature branch:

```bash
docker compose --project-name starme config
docker compose --project-name starme build --pull
docker compose --project-name starme up -d postgres redis
docker compose --project-name starme run --rm api alembic upgrade head
docker compose --project-name starme up -d api worker
docker compose --project-name starme ps
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

## Active deployment checkpoint - 6 August 2026

- Host path: `/home/hungama/apps/starme`
- Deployed source commit: `8b85832`
- Compose project: `starme`
- API: `127.0.0.1:8200`
- PostgreSQL: `127.0.0.1:55433`
- Redis: `127.0.0.1:56380`
- Migration: `20260806_0002 (head)`
- Worker queues: `starme-first-look`, `starme-full-render`
- Exposure: loopback only; verified through SSH tunnel
- Providers: synthetic `stub` renderer and `memory` delivery
- Sensitive processing: disabled
- Consent version: unset pending Legal

Operational commands must run from the host path above and include
`docker compose --project-name starme`. Do not use `down -v`, because that would delete persistent
database and Redis volumes.
