# CineIQ integration - what Engineering needs (ST-P0-08)

**Date:** 7 August 2026
**Owner of this handoff:** Dheeraj Goel (technical), CineIQ team access via Madhav
**Note:** GPU is descoped for now per Amol; we will run on the AIStaging CPU server, accepting slower
render times. CineIQ access is the remaining hard blocker for real face-swap.

To plug CineIQ in as the StarME render provider, we need the following delivered through controlled
storage (not Git, no secrets in chat):

1. **The face-swap tool** as a headless CLI or, preferably, a Docker image, invokable without a UI.
   Example shape we can wire to:
   `render --selfie tester.jpg --refs refs/arjun/ --episode ep01.mp4 --out ep01_swapped.mp4`
2. **Model weights / checkpoints** the tool needs (swap model plus any face-restoration model), with
   the exact file paths and config the tool expects.
3. **Runtime / environment**: Python version and dependencies, or the container image; whether it
   supports **CPU execution** (we have no GPU on this host) and any minimum RAM.
4. **Target-character control**: how the tool is told to replace ONLY the designated character
   (Arjun) and leave Riya and others untouched, e.g. a target reference embedding or a per-face
   match. This is essential; episodes contain multiple faces.
5. **I/O contract**: accepted inputs (selfie, reference-still folder, episode mp4), guaranteed
   outputs (mp4 with the original audio preserved), and tunable knobs (similarity threshold,
   restoration strength).
6. **Licensing confirmation** that the code and model weights are cleared for this internal
   prototype use (ST-P0-08).
7. **Access route**: git repo URL or container registry plus credentials, or a versioned tarball in
   controlled storage.
8. **One known-good example**: a sample command and its expected output clip, so we can confirm our
   environment reproduces CineIQ's result before wiring it into the queue.

Once these arrive, the integration is: implement a `cineiq` RenderProvider behind the existing
provider interface, set `STARME_RENDER_PROVIDER=cineiq` and `STARME_ALLOW_SENSITIVE_PROCESSING=true`
with real inputs, and swap the passthrough delivery for real swapped outputs. Selfie upload and
protected storage are then enabled under their own controls.
