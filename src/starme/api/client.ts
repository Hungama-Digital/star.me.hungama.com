// src/starme/api/client.ts
// fetch wrapper mirroring StarMeApiClient.kt: AbortController timeouts, ApiError
// carrying the HTTP status, and the multipart face-asset upload.
//
// Auth: the backend no longer validates an access code / Bearer token. Every
// StarME call instead carries an `X-Device-Id` header — the stable per-install id.
import { STARME_API_BASE_URL } from '../config';
import { session } from '../data/session';
import type { FaceAssetDto } from './types';

export class ApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const BASE_URL = STARME_API_BASE_URL;

// Timeouts: connect 10s, read 30s. Face upload uses 120s (it waits on the provider).
export const TIMEOUTS = { read: 30_000, upload: 120_000 } as const;

// The device identifier sent on every request (stable per install, from session).
const DEVICE_ID_HEADER = 'X-Device-Id';

export async function callText(
  method: string,
  path: string,
  body?: string,
  readTimeoutMs: number = TIMEOUTS.read,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), readTimeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        [DEVICE_ID_HEADER]: session.deviceBindingId(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
    });
    const payload = await res.text();
    if (!res.ok) throw new ApiError(res.status, payload || 'Request failed');
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /v1/identity/face-assets — multipart/form-data, one part named `image`.
 * Runs for BOTH capture paths (selfie and gallery). Type is deliberately
 * octet-stream to match Android. Do NOT set Content-Type; the runtime adds the boundary.
 * Carries the X-Device-Id header like every other call.
 */
export async function uploadFaceAsset(fileUri: string, fileName: string): Promise<FaceAssetDto> {
  const form = new FormData();
  form.append('image', {
    uri: fileUri,
    name: fileName,
    type: 'application/octet-stream',
  } as unknown as Blob);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUTS.upload);
  try {
    const res = await fetch(`${BASE_URL}/v1/identity/face-assets`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        [DEVICE_ID_HEADER]: session.deviceBindingId(),
      },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text || 'Upload failed');
    return JSON.parse(text) as FaceAssetDto;
  } finally {
    clearTimeout(timer);
  }
}
