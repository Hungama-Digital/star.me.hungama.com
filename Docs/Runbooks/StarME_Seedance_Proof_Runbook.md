# StarME Seedance 2.0 proof runbook

**Status:** Provider, media pipeline and RQ contracts implemented; real-human asset-library access
pending BytePlus AK/SK, Advanced Creation Rights and liveness verification.

## Safety boundary

Never put credentials, subscriber images, signed URLs or generated media in Git. A ModelArk API key
can create generation tasks but cannot create a verified real-human asset group. Do not treat a
third-party synthetic human portrait as a BytePlus trusted asset. Only use an `asset://` URI whose
status is `Active` and whose authorization/provenance is recorded.

Generation is deliberately guarded by `--confirm-billable`. The CLI does not upload assets or
bypass BytePlus moderation. Keep `generate_audio=false`; StarME preserves and remuxes source audio.

## 1. Validate authentication without creating a task

```bash
.venv/bin/starme-seedance auth-check
```

Expected result: an authenticated 404 for the deliberately nonexistent task. This does not consume
generation credits.

## 2. Extract one controlled shot

Choose a 2 to 15 second vertical shot with one clearly visible target and no cuts. Start with 5 to
10 seconds.

```bash
.venv/bin/starme-seedance extract-shot /protected/source.mp4 \
  --start 0 --duration 5 \
  --video tmp/seedance-proof/shot.mp4 \
  --audio tmp/seedance-proof/original-audio.m4a
```

Host `shot.mp4` at a temporary HTTPS URL that BytePlus can fetch. Keep the worker-local paths for
quality comparison and audio remuxing.

## 3. Prepare the ignored render specification

Create `tmp/seedance-proof/spec.json` (the `tmp/` tree is Git-ignored):

```json
{
  "reference": "proof-001",
  "source_video_url": "https://temporary-protected-url/shot.mp4",
  "source_video_path": "tmp/seedance-proof/shot.mp4",
  "original_audio_path": "tmp/seedance-proof/original-audio.m4a",
  "reference_asset_uris": ["asset://ACTIVE_AUTHORIZED_ASSET"],
  "prompt_variant": "identity_lock",
  "ratio": "adaptive",
  "duration": 5
}
```

## 4. Run one bounded proof

```bash
.venv/bin/starme-seedance render tmp/seedance-proof/spec.json --confirm-billable
```

The pipeline submits, polls, atomically downloads the silent result, remuxes original audio and
writes a JSON structural quality report below `STARME_RENDER_WORK_DIR/<reference>/`.
The Compose worker image includes FFmpeg, mounts protected source media read-only at `/media`, and
persists working outputs in the `starme_renders` volume at `/renders`.

## 5. Acceptance

Automated gates must pass: duration tolerance, exact dimensions, portrait orientation, supported
video codec and audio presence. Then manually review target identity consistency, non-target faces,
flicker/morphing, expression/lip timing, hands/body, costume, props, background, camera motion,
lighting, added text/logos and shot continuity. Structural success alone is not creative approval.

Run prompt variants `identity_lock`, `performance_lock` and `continuity_lock` only after the first
proof succeeds. Record task ID, input provenance, prompt variant, output checksum, quality report,
cost/latency and reviewer decision for every run.
