// src/starme/state/types.ts
// Direct port of StarUiState.kt.
import type { EpisodeDto } from '../api/types';

export type VerifyState = 'WAITING' | 'CHECKING' | 'PASSED' | 'FAILED';

export type IdentityAssetState =
  | 'LOCAL_CHECKS_PENDING'
  | 'STAGING_LOCAL_ONLY'
  | 'AWAITING_LIVENESS'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'ACTIVE'
  | 'FAILED';

export type VerifyRow = { label: string; state: VerifyState };

// Order matters. Index 1 is the real face gate, index 2 is the quality gate.
export const defaultVerifyRows: VerifyRow[] = [
  { label: 'Photo is readable on this device', state: 'WAITING' },
  { label: 'Exactly one face detected', state: 'WAITING' },
  { label: 'Face is clear enough for casting', state: 'WAITING' },
  { label: 'Consent step ready for age confirmation', state: 'WAITING' },
];
export const FACE_ROW = 1;
export const QUALITY_ROW = 2;

export type StarUiState = {
  // Controlled prototype access
  accessCode: string;
  authenticating: boolean;
  authenticated: boolean;
  accessError: string | null;

  // Membership / wallet
  credits: number;
  subscribed: boolean;
  subscribing: boolean;

  // Identity
  photoPath: string | null;
  name: string;
  verifying: boolean;
  verified: boolean;
  identityProviderEnabled: boolean;
  identityAssetState: IdentityAssetState;
  identityAssetId: string | null;
  verifyRows: VerifyRow[];
  verifyError: string | null;

  // Consent
  consentRef: string | null;
  signed: boolean;
  consentSubmitFailed: boolean;
  consentVersion: string | null;
  legalTextStatus: string; // default 'pending_final_legal_wording'

  // Story
  shellId: string | null;
  roleId: string | null;
  packageId: string | null;

  // Order + production
  orderId: number | null; // local SQLite row id
  remoteOrderId: string | null; // server order id
  rendering: boolean;
  renderComplete: boolean;
  renderStageLabel: string | null;
  renderProgress: number; // 0..1
  awaitingFirstLook: boolean;
  firstLookUrl: string | null;
  retakeRequired: boolean;
  remoteEpisodes: EpisodeDto[];
};

// Derived gates. These are the only things that unlock a step.
export const hasPhoto = (s: StarUiState) => s.photoPath !== null;

export const canContinueCapture = (s: StarUiState) =>
  s.verified &&
  s.name.trim().length > 0 &&
  (!s.identityProviderEnabled || s.identityAssetState === 'ACTIVE');

export const canContinueConsent = (s: StarUiState) => s.signed && s.consentRef !== null;

export const canContinueConcept = (s: StarUiState) => s.shellId !== null && s.roleId !== null;

export const initialState: StarUiState = {
  accessCode: '',
  authenticating: false,
  // Access-code gate removed: StarME opens straight into the flow, no tester code.
  authenticated: true,
  accessError: null,

  credits: 0,
  subscribed: false,
  subscribing: false,

  photoPath: null,
  name: '',
  verifying: false,
  verified: false,
  identityProviderEnabled: false,
  identityAssetState: 'LOCAL_CHECKS_PENDING',
  identityAssetId: null,
  verifyRows: defaultVerifyRows,
  verifyError: null,

  consentRef: null,
  signed: false,
  consentSubmitFailed: false,
  consentVersion: null,
  legalTextStatus: 'pending_final_legal_wording',

  shellId: null,
  roleId: null,
  packageId: null,

  orderId: null,
  remoteOrderId: null,
  rendering: false,
  renderComplete: false,
  renderStageLabel: null,
  renderProgress: 0,
  awaitingFirstLook: false,
  firstLookUrl: null,
  retakeRequired: false,
  remoteEpisodes: [],
};
