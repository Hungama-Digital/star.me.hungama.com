// src/starme/state/store.ts
// Port of StarViewModel.kt: one Zustand store, every intent mapped 1:1, all
// navigation delegated to StarEvents (the host turns them into navigation).
//
// NOTE: the controlled-access tester-code gate has been removed. StarME opens
// straight into the flow and the /v1 calls are made without a Bearer token.
import { create } from 'zustand';
import {
  defaultVerifyRows,
  FACE_ROW,
  initialState,
  QUALITY_ROW,
  type StarUiState,
  type VerifyRow,
} from './types';
import { emitStarEvent } from './events';
import { api, buildServerOrderRequest } from '../api/endpoints';
import { ApiError } from '../api/client';
import { userFacingErrors } from './errors';
import { loadSession, session } from '../data/session';
import { walletRepo } from '../data/walletRepo';
import { consentRepo } from '../data/consentRepo';
import { orderRepo } from '../data/orderRepo';
import { pkg, welcomeCredits, liveShells } from '../data/manifest';
import { files } from '../data/files';
import { billing, TOP_UP_CREDITS } from '../services/billing';
import { faceChecker } from '../services/faceChecker';
import { BUILD_REAL_IDENTITY_ENABLED } from '../config';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const VERIFY_ROW_MS = 650;

export interface StarActions {
  hydrate(): Promise<void>;
  refreshCapabilities(): Promise<void>;
  recoverStaleConsent(ref: string, e: unknown): Promise<boolean>;

  onSubscribe(): Promise<void>;

  onNameChanged(name: string): void;
  onPhotoSelected(uri: string): Promise<void>;
  runVerification(): Promise<void>;
  registerFaceAsset(): Promise<void>;
  /** Clear the chosen photo + its verification so the capture screen resets. */
  resetPhoto(): void;

  /** Auto-pick the single live story world + its role (the "Choose Your World" step is gone). */
  autoSelectWorld(): void;

  onConsentSigned(signaturePng: string, checkedA: boolean, checkedB: boolean): Promise<void>;
  onSignatureCleared(): void;

  selectShell(shellId: string): void;
  selectRole(roleId: string): void;
  selectPackage(packageId: string): void;
  onConfirmPackage(): Promise<void>;

  pollProductionStatus(): Promise<void>;
  onStartRender(): Promise<void>;
  decideFirstLook(decision: 'APPROVE' | 'RETAKE'): Promise<void>;
  approveFirstLook(): Promise<void>;
  requestRetake(): Promise<void>;

  onMakeAnother(): void;
  revokeConsent(onDone: () => void): Promise<void>;

  /** DEV-ONLY: force arbitrary state. Not used by real screens. */
  __devSet(partial: Partial<StarUiState>): void;
}

export type StarStore = StarUiState & StarActions;

export const useStarStore = create<StarStore>()((set, get) => ({
  ...initialState,

  // ---------- hydrate on app start ----------
  async hydrate() {
    await loadSession();
    await files.ensureDirs();

    // No access code / Bearer token anymore: the backend identifies each call by the
    // X-Device-Id header the client attaches from session.deviceBindingId().
    const remoteOrderId = session.getRemoteOrderId();
    const localOrderId = session.getLocalOrderId();
    set({ authenticated: true, remoteOrderId, orderId: localOrderId });
    // "Choose Your World" was removed from the flow: always cast the single live world.
    get().autoSelectWorld();
    // NOTE: launch resume-navigation is NOT emitted here. StarNavigator gates the whole
    // shell behind a boot splash until hydrate() resolves, then mounts the navigator
    // DIRECTLY on the resolved route (Production if a saved order exists, else Promo) so
    // the Promo/home screen never flashes before the jump. OrderCreated -> Production is
    // only for an order placed FRESH during this session (see createOrder).

    await get().refreshCapabilities();
    await walletRepo.ensureInitialized();
    walletRepo.subscribe((credits) => set({ credits }));

    // Restore identity + consent so "Make another drama" and process death keep them.
    const subscribed = session.getSubscribed();
    const ref = session.getConsentRef();
    const record = ref ? await consentRepo.byRef(ref) : null;
    const valid = !!record && record.checkedA === 1 && record.checkedB === 1 && !record.revokedAtEpoch;
    // Restore membership + consent + name across launches, but NEVER the photo:
    // the Capture screen always starts empty so the user must pick a fresh selfie
    // that passes the on-device face check — a saved photo is never blindly accepted.
    set((s) => ({
      subscribed,
      consentRef: valid ? record!.ref : null,
      signed: !!valid,
      name: valid ? record!.name : s.name,
      photoPath: s.photoPath,
      verified: s.verified,
      verifyRows: s.verifyRows,
      identityAssetState: s.identityAssetState,
    }));
  },

  async refreshCapabilities() {
    try {
      const c = await api.capabilities();
      set(() => ({
        identityProviderEnabled: BUILD_REAL_IDENTITY_ENABLED && c.identity_capture,
        consentVersion: c.consent_version ?? null,
        legalTextStatus: c.legal_text_status,
      }));
    } catch {
      /* leave capabilities as they are; do not block the app */
    }
  },

  async recoverStaleConsent(ref: string, e: unknown) {
    if (e instanceof ApiError && e.statusCode === 409) {
      await consentRepo.invalidateLocalOwnership(ref);
      session.clearConsent();
      set({ consentRef: null, signed: false, consentSubmitFailed: false });
      emitStarEvent({ type: 'ConsentRequired' });
      emitStarEvent({
        type: 'Toast',
        message: 'Please confirm consent for this session. Your photo and selections are saved.',
      });
      return true;
    }
    return false;
  },

  // ---------- Membership ----------
  async onSubscribe() {
    const s = get();
    if (s.subscribing || s.subscribed) {
      emitStarEvent({ type: 'SubscribeComplete' });
      return;
    }
    set({ subscribing: true });
    const result = await billing.purchaseSubscription(welcomeCredits);
    if (result.success) {
      await walletRepo.add(result.creditsGranted);
      session.setSubscribed(true);
      set({ subscribing: false, subscribed: true });
      emitStarEvent({
        type: 'Toast',
        message: `Welcome to Fast TV · ${result.creditsGranted} credits added`,
      });
      emitStarEvent({ type: 'SubscribeComplete' });
    } else {
      set({ subscribing: false });
      emitStarEvent({ type: 'Error', message: 'Subscription could not be completed.' });
    }
  },

  // ---------- Capture ----------
  onNameChanged(name) {
    set({ name: name.slice(0, 28) });
  },

  async onPhotoSelected(uri) {
    const file = await files.copyImageToTemp(uri).catch(() => null);
    if (!file) {
      emitStarEvent({ type: 'Error', message: "We couldn't read that photo. Try another." });
      return;
    }
    set({
      photoPath: file,
      verified: false,
      identityAssetState: 'LOCAL_CHECKS_PENDING',
      identityAssetId: null,
      verifyError: null,
      verifyRows: defaultVerifyRows,
    });
    await get().runVerification();
  },

  async runVerification() {
    const path = get().photoPath;
    if (!path) return;
    set({ verifying: true, verified: false, verifyError: null, verifyRows: defaultVerifyRows });

    // Run the real detector ONCE up front, then animate the rows against its result.
    const face = await faceChecker.analyze(path).catch(() => ({ faceCount: 0, eyesOpen: false }));

    const rows: VerifyRow[] = defaultVerifyRows.map((r) => ({ ...r }));
    for (let i = 0; i < rows.length; i++) {
      rows[i].state = 'CHECKING';
      set({ verifyRows: [...rows] });
      await sleep(VERIFY_ROW_MS);

      if (i === FACE_ROW && face.faceCount !== 1) {
        rows[i].state = 'FAILED';
        set({
          verifyRows: [...rows],
          verifying: false,
          verified: false,
          verifyError:
            face.faceCount === 0
              ? "We couldn't find a face. Retake in even, front-facing light, no sunglasses, no filters."
              : 'More than one face detected. StarME casts you and only you. Retake solo.',
        });
        return;
      }
      if (i === QUALITY_ROW && !face.eyesOpen) {
        rows[i].state = 'FAILED';
        set({
          verifyRows: [...rows],
          verifying: false,
          verified: false,
          verifyError: 'Keep both eyes open and face the camera in even light.',
        });
        return;
      }
      rows[i].state = 'PASSED';
      set({ verifyRows: [...rows] });
    }

    set((s) => ({
      verifying: false,
      verified: true,
      verifyError: null,
      identityAssetState: s.identityProviderEnabled ? 'UPLOADING' : 'STAGING_LOCAL_ONLY',
    }));
    if (get().identityProviderEnabled) await get().registerFaceAsset();
  },

  async registerFaceAsset() {
    const path = get().photoPath;
    if (!path) return;
    try {
      const dto = await api.uploadFaceAsset(path, files.basename(path));
      set({ identityAssetId: dto.face_asset_id, identityAssetState: 'ACTIVE' });
      emitStarEvent({ type: 'Toast', message: 'Photo registered for casting' });
    } catch (e) {
      set({ identityAssetState: 'FAILED' });
      const message =
        e instanceof ApiError && e.statusCode === 422
          ? e.message || 'That photo could not be used. Try another.'
          : 'We could not register that photo. Check your connection and retry.';
      emitStarEvent({ type: 'Error', message });
    }
  },

  // ---------- Consent ----------
  async onConsentSigned(signaturePng, checkedA, checkedB) {
    if (!checkedA || !checkedB) return;
    // Already have a valid ref this session: re-arm the gate, do not duplicate the record.
    if (get().consentRef !== null) {
      set({ signed: true });
      return;
    }

    set({ consentSubmitFailed: false });
    const consentVersion = get().consentVersion;
    if (!consentVersion) {
      set({ consentSubmitFailed: true });
      emitStarEvent({
        type: 'Error',
        message:
          'Consent is not available on this server yet. Legal-approved wording must be configured before testing.',
      });
      return;
    }

    const request = {
      typed_name: get().name,
      consent_version: consentVersion,
      checked_likeness: checkedA,
      checked_revocation: checkedB,
      signature_attested: true,
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const remote = await api.createConsent(request);
        const record = await consentRepo.recordConsent({
          reference: remote.reference,
          name: get().name,
          photoSource: get().photoPath,
          signaturePng,
          checkedA,
          checkedB,
          consentVersion,
        });
        session.setActiveConsent(record.ref, record.name);
        set({
          consentRef: record.ref,
          signed: true,
          consentSubmitFailed: false,
          photoPath: record.photoUri ?? get().photoPath,
        });
        return;
      } catch (e) {
        lastError = e;
        if (attempt < 2) await sleep(1200);
      }
    }
    set({ consentSubmitFailed: true });
    emitStarEvent({ type: 'Error', message: userFacingErrors.consent(lastError) });
  },

  onSignatureCleared() {
    set({ signed: false });
  },

  resetPhoto() {
    set({
      photoPath: null,
      verifying: false,
      verified: false,
      verifyError: null,
      verifyRows: defaultVerifyRows,
      identityAssetState: 'LOCAL_CHECKS_PENDING',
      identityAssetId: null,
    });
  },

  autoSelectWorld() {
    const sh = liveShells()[0];
    if (!sh) return;
    set({ shellId: sh.id, roleId: sh.roles?.[0]?.id ?? null });
  },

  // ---------- Concept ----------
  selectShell(shellId) {
    // Changing the world always forces a fresh role choice.
    set({ shellId, roleId: null });
  },
  selectRole(roleId) {
    set({ roleId });
  },

  // ---------- Package ----------
  selectPackage(packageId) {
    set({ packageId });
  },

  async onConfirmPackage() {
    const s = get();
    const p = pkg(s.packageId);
    if (!p) return;
    if (!s.consentRef) {
      emitStarEvent({ type: 'Error', message: 'Consent is required before ordering.' });
      return;
    }

    // Short on credits: run the demo top-up and stay on this screen.
    if (s.credits < p.credits) {
      const result = await billing.purchaseCredits(TOP_UP_CREDITS);
      if (result.success) {
        await walletRepo.add(result.creditsGranted);
        emitStarEvent({ type: 'Toast', message: `${result.creditsGranted} credits added · demo` });
        emitStarEvent({ type: 'CreditsToppedUp' });
      }
      return;
    }

    // 1. Local pending order first, so the FK check runs before any money moves.
    let localId: number;
    try {
      localId = await orderRepo.createOrder({
        consentRef: s.consentRef,
        shellId: s.shellId ?? '',
        roleId: s.roleId ?? '',
        packageId: p.id,
        episodesUnlocked: p.episodes,
      });
    } catch (e) {
      emitStarEvent({ type: 'Error', message: (e as Error).message });
      return;
    }

    // 2. Remote order, with the server-enabled id mapping.
    try {
      const order = await api.createOrder(
        buildServerOrderRequest({
          consentRef: s.consentRef,
          roleId: s.roleId,
          identityAssetId: s.identityAssetId,
        }),
      );
      session.setActiveOrder(order.id, localId);
      await walletRepo.add(-p.credits); // debit only after the server accepted
      set({
        orderId: localId,
        remoteOrderId: order.id,
        awaitingFirstLook: order.status === 'AWAITING_FIRST_LOOK',
        firstLookUrl: order.first_look?.preview_url ?? null,
        remoteEpisodes: order.episodes,
      });
      emitStarEvent({ type: 'OrderCreated' });
    } catch (e) {
      await orderRepo.discardPending(localId); // never leave a phantom local order
      if (!(await get().recoverStaleConsent(s.consentRef, e))) {
        emitStarEvent({ type: 'Error', message: userFacingErrors.order(e) });
      }
    }
  },

  // ---------- Production ----------
  async pollProductionStatus() {
    const remoteOrderId = get().remoteOrderId;
    if (!remoteOrderId) return;
    try {
      const order = await api.order(remoteOrderId);
      const ready = order.status === 'READY';
      // Do NOT re-raise the first look once approved (see guide 7.7).
      const awaiting =
        order.status === 'AWAITING_FIRST_LOOK' && order.first_look?.status !== 'APPROVED';
      set((s) => ({
        awaitingFirstLook: awaiting,
        renderComplete: ready,
        firstLookUrl: order.first_look?.preview_url ?? s.firstLookUrl,
        renderProgress: ready ? 1 : awaiting ? 0.5 : s.renderProgress,
        remoteEpisodes: order.episodes.length ? order.episodes : s.remoteEpisodes,
      }));
      if (ready) {
        emitStarEvent({ type: 'Toast', message: 'Now premiering · you' });
        emitStarEvent({ type: 'RenderComplete' });
      }
    } catch {
      /* quiet poll: transient failures are swallowed so a blip cannot interrupt a demo */
    }
  },

  async onStartRender() {
    const remoteOrderId = get().remoteOrderId;
    if (!remoteOrderId) return;
    set({ rendering: true });
    try {
      const order = await api.order(remoteOrderId);
      const ready = order.status === 'READY';
      const awaiting =
        order.status === 'AWAITING_FIRST_LOOK' && order.first_look?.status !== 'APPROVED';
      set((s) => ({
        rendering: false,
        awaitingFirstLook: awaiting,
        renderComplete: ready,
        firstLookUrl: order.first_look?.preview_url ?? s.firstLookUrl,
        renderProgress: ready ? 1 : awaiting ? 0.5 : s.renderProgress,
        renderStageLabel: awaiting
          ? 'First look ready for your approval'
          : ready
            ? 'Ready to premiere'
            : order.status,
        remoteEpisodes: order.episodes.length ? order.episodes : s.remoteEpisodes,
      }));
      if (ready) {
        emitStarEvent({ type: 'Toast', message: 'Now premiering · you' });
        emitStarEvent({ type: 'RenderComplete' });
      }
    } catch {
      // Stale/unknown demo order or a transient blip: keep the user in production
      // with a soft note instead of a scary failure, and never disturb the countdown.
      set({ rendering: false });
      emitStarEvent({ type: 'Toast', message: 'Still in production · check back soon' });
    }
  },

  async decideFirstLook(decision) {
    const orderId = get().remoteOrderId;
    if (!orderId) return;
    try {
      const order = await api.decideFirstLook(orderId, decision);
      if (decision === 'RETAKE') {
        set({ awaitingFirstLook: false, retakeRequired: true, verified: false, photoPath: null });
        emitStarEvent({ type: 'RetakeRequested' });
      } else {
        set((s) => ({
          awaitingFirstLook: false,
          rendering: false,
          renderComplete: order.status === 'READY',
          renderProgress: order.status === 'READY' ? 1 : s.renderProgress,
          renderStageLabel: order.status,
          remoteEpisodes: order.episodes,
        }));
        if (order.status === 'READY') {
          emitStarEvent({ type: 'Toast', message: 'Now premiering · you' });
          emitStarEvent({ type: 'RenderComplete' });
        }
      }
    } catch {
      emitStarEvent({ type: 'Error', message: 'First-look decision could not be saved.' });
    }
  },

  approveFirstLook() {
    return get().decideFirstLook('APPROVE');
  },
  requestRetake() {
    return get().decideFirstLook('RETAKE');
  },

  // ---------- Premiere ----------
  onMakeAnother() {
    session.clearActiveOrder();
    set({
      packageId: null,
      orderId: null,
      remoteOrderId: null,
      rendering: false,
      renderComplete: false,
      renderStageLabel: null,
      renderProgress: 0,
      awaitingFirstLook: false,
      firstLookUrl: null,
      remoteEpisodes: [],
    });
    // photoPath, name, verified, consentRef, credits all survive deliberately.
  },

  // ---------- Settings ----------
  async revokeConsent(onDone) {
    const ref = get().consentRef;
    if (!ref) return;

    // Server FIRST. If it fails, change nothing locally and say so plainly.
    try {
      await api.revokeConsent(ref);
    } catch {
      emitStarEvent({
        type: 'Error',
        message: 'Server revocation failed; local data was not changed.',
      });
      return;
    }

    await consentRepo.revoke(ref);
    session.clearConsent();
    session.clearActiveOrder();
    set({
      consentRef: null,
      signed: false,
      photoPath: null,
      verified: false,
      verifyRows: defaultVerifyRows,
      identityAssetState: 'LOCAL_CHECKS_PENDING',
      identityAssetId: null,
      orderId: null,
      remoteOrderId: null,
      awaitingFirstLook: false,
      firstLookUrl: null,
      remoteEpisodes: [],
    });
    emitStarEvent({
      type: 'Toast',
      message: 'Consent revoked · local photo removed and server deletion requested',
    });
    onDone();
  },

  __devSet(partial) {
    set(partial);
  },
}));

// Re-export the resume rule used by the bottom nav "Create" destination.
export { nextCreationRoute } from '../nav/routes';
