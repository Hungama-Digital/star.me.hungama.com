// src/starme/api/types.ts
// Wire DTOs for the /v1 contract. Snake_case stays snake_case on the wire and in
// these types, exactly as the Kotlin @SerialName annotations declare, so the store
// can read order.first_look?.preview_url etc. without a rename layer.

export interface CapabilityDto {
  catalogue: boolean;
  identity_capture: boolean;
  consent_collection: boolean;
  rendering: boolean;
  media_delivery: boolean;
  consent_version: string | null;
  legal_text_status: string; // 'configured' | 'pending_final_legal_wording'
  reason?: string;
}

export interface ConsentRequest {
  typed_name: string;
  consent_version: string;
  checked_likeness: boolean;
  checked_revocation: boolean;
  signature_attested: boolean;
}

export interface ConsentDto {
  reference: string;
  consent_version: string;
  accepted_at: string;
  revoked_at: string | null;
  deletion_requested_at: string | null;
  legal_text_status: string;
}

export interface ConsentDeletionDto {
  consent_reference: string;
  canceled_orders: number;
  canceled_jobs: number;
  deletion_requested_at: string;
}

export interface FaceAssetDto {
  face_asset_id: string; // provider uri
  tester_reference: string;
}

export interface OrderRequest {
  consent_reference: string;
  shell_id: string;
  role_id: string;
  package_id: string;
  face_asset_id: string;
}

export type OrderStatus =
  | 'QUEUED'
  | 'FIRST_LOOK_RENDERING'
  | 'AWAITING_FIRST_LOOK'
  | 'RETAKE_REQUIRED'
  | 'FULL_RENDERING'
  | 'READY'
  | 'FAILED'
  | 'CANCELED';

export type FirstLookStatus = 'PENDING' | 'APPROVED' | 'RETAKE' | string;

export interface FirstLookDto {
  status: FirstLookStatus;
  preview_url: string | null;
}

export interface JobDto {
  id: string;
  kind: string; // 'FIRST_LOOK' | ...
  status: string;
  attempt_count: number;
  failure_reason: string | null;
}

export interface EpisodeDto {
  episode_number: number;
  checksum_sha256: string;
  stream_url: string;
  download_url: string;
}

export interface OrderDto {
  id: string;
  status: OrderStatus;
  shell_id: string;
  role_id: string;
  package_id: string;
  first_look?: FirstLookDto | null;
  jobs: JobDto[];
  episodes: EpisodeDto[];
}

export type FirstLookDecision = 'APPROVE' | 'RETAKE';
