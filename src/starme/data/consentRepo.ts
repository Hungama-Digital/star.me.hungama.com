// src/starme/data/consentRepo.ts
// Port of ConsentRepository.kt. Creates, reads and revokes consent records and
// owns the on-device biometric files that back them.
import { getDb, type ConsentRow } from './db';
import { files } from './files';

const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** STARME-{year}-{6 uppercase alphanumerics}. In practice the server ref is used. */
function generateRef(): string {
  const year = new Date().getFullYear();
  const bytes = new Uint8Array(6);
  (globalThis.crypto as Crypto | undefined)?.getRandomValues?.(bytes);
  let sb = '';
  for (let i = 0; i < 6; i++) {
    const v = bytes[i] || Math.floor(Math.random() * 256);
    sb += ALPHANUM[v % ALPHANUM.length];
  }
  return `STARME-${year}-${sb}`;
}

export const consentRepo = {
  async byRef(ref: string): Promise<ConsentRow | null> {
    const db = await getDb();
    return (
      (await db.getFirstAsync<ConsentRow>('SELECT * FROM consent_records WHERE ref = ?', ref)) ??
      null
    );
  },

  /**
   * Persists a signed consent: commits the photo + signature to internal storage,
   * writes the record (INSERT OR REPLACE), returns it.
   */
  async recordConsent(input: {
    reference?: string | null;
    name: string;
    photoSource: string | null;
    signaturePng: string | null; // base64 PNG
    checkedA: boolean;
    checkedB: boolean;
    consentVersion: string;
  }): Promise<ConsentRow> {
    const db = await getDb();
    const ref = input.reference ?? generateRef();
    const { photoUri, signaturePngUri } = await files.commitConsentAssets(
      ref,
      input.photoSource,
      input.signaturePng,
    );
    const row: ConsentRow = {
      ref,
      name: input.name,
      photoUri,
      signaturePngUri,
      consentVersion: input.consentVersion,
      checkedA: input.checkedA ? 1 : 0,
      checkedB: input.checkedB ? 1 : 0,
      signedAtEpoch: Date.now(),
      revokedAtEpoch: null,
    };
    await db.runAsync(
      `INSERT OR REPLACE INTO consent_records
        (ref, name, photoUri, signaturePngUri, consentVersion, checkedA, checkedB, signedAtEpoch, revokedAtEpoch)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.ref,
      row.name,
      row.photoUri,
      row.signaturePngUri,
      row.consentVersion,
      row.checkedA,
      row.checkedB,
      row.signedAtEpoch,
      row.revokedAtEpoch,
    );
    return row;
  },

  /**
   * Revocation: stamp revokedAtEpoch, null the biometric columns, delete the files,
   * but keep the row for auditability (spec section 4).
   */
  async revoke(ref: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'UPDATE consent_records SET revokedAtEpoch = ? WHERE ref = ?',
      Date.now(),
      ref,
    );
    await db.runAsync(
      'UPDATE consent_records SET photoUri = NULL, signaturePngUri = NULL WHERE ref = ?',
      ref,
    );
    await files.deleteConsentAssets(ref);
  },

  /**
   * Marks a restored reference unusable when the server says it belongs to a different
   * tester identity. Keeps the capture files available so the tester can consent again;
   * this is recovery from stale ownership, not a user-requested biometric deletion.
   */
  async invalidateLocalOwnership(ref: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'UPDATE consent_records SET revokedAtEpoch = ? WHERE ref = ?',
      Date.now(),
      ref,
    );
  },
};
