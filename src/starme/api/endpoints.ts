// src/starme/api/endpoints.ts
// The 8 calls, plus the section 7.6 server-id mapping kept in ONE place so it is
// easy to widen when more shells are enabled on the backend.
import { callText, uploadFaceAsset } from './client';
import type {
  CapabilityDto,
  ConsentDto,
  ConsentRequest,
  FirstLookDecision,
  OrderDto,
  OrderRequest,
  SessionDto,
} from './types';

/**
 * CRITICAL (section 7.6): the ids sent to the server are constants that differ
 * from the manifest ids the user sees. The server only enables this one triple.
 * Do NOT "fix" this. Widen here when the backend enables more shells.
 */
export const SERVER_IDS = {
  shellId: 'ek-love-story-001', // the only enabled shell in catalogue.py
  packageId: 'lead-debut-3', // the server rejects anything else with 422
  roleFallback: 'arjun', // the only enabled role for that shell
  faceAssetFallback: 'synthetic-device-capture', // accepted when sensitive processing is off
} as const;

/**
 * Builds the wire order request from the user's local selections, substituting the
 * server-enabled constants. role_id uses the chosen role with the 'arjun' fallback;
 * face_asset_id uses the registered asset with the 'synthetic-device-capture' fallback.
 */
export function buildServerOrderRequest(input: {
  consentRef: string;
  roleId: string | null;
  identityAssetId: string | null;
}): OrderRequest {
  return {
    consent_reference: input.consentRef,
    shell_id: SERVER_IDS.shellId,
    role_id: input.roleId ?? SERVER_IDS.roleFallback,
    package_id: SERVER_IDS.packageId,
    face_asset_id: input.identityAssetId ?? SERVER_IDS.faceAssetFallback,
  };
}

// Access-code gate removed: these calls no longer send a Bearer token.
export const api = {
  capabilities: () =>
    callText('GET', '/v1/capabilities').then((j) => JSON.parse(j) as CapabilityDto),

  redeem: (code: string, deviceId: string) =>
    callText('POST', '/v1/access/redeem', JSON.stringify({ code, device_id: deviceId })).then(
      (j) => JSON.parse(j) as SessionDto,
    ),

  createConsent: (req: ConsentRequest) =>
    callText('POST', '/v1/consents', JSON.stringify(req)).then((j) => JSON.parse(j) as ConsentDto),

  revokeConsent: (ref: string) => callText('DELETE', `/v1/consents/${ref}`),

  createOrder: (req: OrderRequest) =>
    callText('POST', '/v1/orders', JSON.stringify(req)).then((j) => JSON.parse(j) as OrderDto),

  order: (id: string) =>
    callText('GET', `/v1/orders/${id}`).then((j) => JSON.parse(j) as OrderDto),

  decideFirstLook: (id: string, decision: FirstLookDecision) =>
    callText('POST', `/v1/orders/${id}/first-look`, JSON.stringify({ decision })).then(
      (j) => JSON.parse(j) as OrderDto,
    ),

  uploadFaceAsset, // see client.ts (7.5)
};
