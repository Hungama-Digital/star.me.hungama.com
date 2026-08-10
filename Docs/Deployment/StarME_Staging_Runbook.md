# StarME Synthetic Staging Deployment Runbook

**Status:** Synthetic HTTPS deployment active; Legal consent version and device acceptance pending

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
- Exposure: containers remain loopback-only; Nginx exposes `https://starme.hungama.com`
- Providers: synthetic `stub` renderer and `memory` delivery
- Sensitive processing: disabled
- Consent version: unset pending Legal
- Approved hostname: `starme.hungama.com` (Route 53 A record to `49.248.193.9`)
- TLS: Let's Encrypt certificate expires 4 November 2026; Certbot renewal timer active

Operational commands must run from the host path above and include
`docker compose --project-name starme`. Do not use `down -v`, because that would delete persistent
database and Redis volumes.

The version-controlled Nginx source is `deploy/nginx/starme.hungama.com.conf`. Install it in
`/etc/nginx/sites-available/`, enable it with the matching symlink, validate with `nginx -t`, and
then use Certbot's Nginx integration to provision HTTPS and redirect HTTP. Never edit another
project’s virtual host to expose StarME.

The HTTPS deployment was verified with HTTP 301 redirection, trusted-certificate validation,
external live/readiness checks, and authenticated catalogue access through Nginx. The API's
server-local `STARME_PUBLIC_API_BASE_URL` is `https://starme.hungama.com`.

## Redeploy checkpoint - 7 August 2026 (real-show catalogue)

Key-based SSH from the development Mac to `hungama@49.248.193.9` is now configured (ed25519), so
deploys run non-interactively. The only backend delta since commit `8b85832` was
`backend/starme/catalogue.py`; a checksum comparison confirmed no other server source file differed.

Steps performed: backed up the server file to `catalogue.py.bak-20260807`, copied the updated
`catalogue.py`, then `docker compose --project-name starme build api worker` and `up -d api worker`.
The `.env` and all other projects were untouched. Migration stayed at `20260806_0002 (head)`.

Verification: all four containers up; local and external `https://starme.hungama.com` live/ready both
`ok`; and an authenticated catalogue smoke test (operator key sourced from server `.env`, never
exposed) returned exactly one shell:
`{"id":"ek-love-story-001","title":"Ek Love Story Aisi Bhi","enabled_role":"arjun","episode_count":3,"synthetic_fixture":true}`.
Sensitive processing remains disabled and the Legal consent version remains unset, so the on-device
journey still stops at Step 3 consent by design.

## Passthrough media delivery deployed - 7 August 2026

Deployed the local passthrough delivery build (commit `5a1ce75`) plus the `compose.yaml` media mount.
Steps: copied `config.py`, `delivery.py`, `api.py`, `services.py` and `compose.yaml` to the server;
set `STARME_MEDIA_DIR=/media` in `.env`; created `/home/hungama/apps/starme/media/shells/ek-love-story-001/`
and uploaded `first_look.jpg`, `poster.jpg`, `episode-1.mp4`, `episode-2.mp4`, `episode-3.mp4` (real
show assets, ~619 MB, not in Git); added `./media:/media:ro` to the api service; rebuilt and restarted
api + worker.

Verification (external client, the path the app uses): a full order flow reached READY, and the signed
URLs served real bytes: first-look `HTTP 200 image/jpeg 324,896 B`; episode-1 `HTTP 206 video/mp4`
with range requests honored (ExoPlayer-friendly). Server-to-own-public-IP loopback is not available
(no NAT hairpin), so media checks must run from an external client, not the server.

Still synthetic where it matters: episodes are the ORIGINAL unmodified masters (no face swap yet);
`STARME_ALLOW_SENSITIVE_PROCESSING` stays false. Real personalised episodes await CineIQ
(`Docs/Intake/CineIQ_Integration_Requirements.md`). Rollback: blank `STARME_MEDIA_DIR` in `.env` and
recreate api + worker to return to the synthetic 204 contract.

## Capability/consent contract redeploy - 10 August 2026

Backend files `api.py` and `schemas.py` from commit `1470447` were deployed with timestamped server
backups, followed by isolated API/worker image rebuild and recreation. PostgreSQL, Redis, media and
server-local `.env` were not changed. External live/readiness checks returned `ok` and
`/v1/capabilities` published `development-placeholder-v1` with `legal_text_status: configured`.
Sensitive identity capture remains disabled. Replace the staging-only placeholder version when final
Legal wording is approved; the updated Android client discovers that version from the server.
