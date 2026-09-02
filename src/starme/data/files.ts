// src/starme/data/files.ts
// On-device file layout, mirroring FileStore.kt (guide section 9.3), over
// expo-file-system. Nothing here leaves the device except the portrait sent to
// /v1/identity/face-assets.
import * as FileSystem from 'expo-file-system';

const DOC = FileSystem.documentDirectory ?? '';
const CACHE = FileSystem.cacheDirectory ?? '';

const consentDir = DOC + 'consent/';
const postersDir = DOC + 'posters/';
const episodesDir = DOC + 'episodes/';
const sharedDir = CACHE + 'shared/';

async function ensureDir(dir: string) {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

export const files = {
  consentDir,
  postersDir,
  episodesDir,
  sharedDir,

  async ensureDirs() {
    await Promise.all([ensureDir(consentDir), ensureDir(postersDir), ensureDir(episodesDir), ensureDir(sharedDir)]);
  },

  capturePath: (timestamp: number) => `${consentDir}capture_${timestamp}.jpg`,
  committedPhotoPath: (ref: string) => `${consentDir}photo_${ref}.jpg`,
  signaturePath: (ref: string) => `${consentDir}sig_${ref}.png`,
  posterPath: (ref: string) => `${postersDir}StarME_${ref}.png`,
  episodePath: (orderId: number, n: number) => `${episodesDir}${orderId}_ep${n}.mp4`,

  basename: (path: string) => path.substring(path.lastIndexOf('/') + 1),

  async exists(path: string): Promise<boolean> {
    return (await FileSystem.getInfoAsync(path)).exists;
  },

  async deleteIfExists(path: string) {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
  },

  /** Copy a picker/camera uri into a working capture file. Returns the new path. */
  async copyImageToTemp(uri: string): Promise<string> {
    await ensureDir(consentDir);
    const dest = files.capturePath(Date.now());
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  },

  async writeBase64Png(path: string, base64: string): Promise<string> {
    await FileSystem.writeAsStringAsync(path, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return path;
  },

  /**
   * Commit the working capture + signature to their ref-keyed committed paths.
   * photoSource is the working capture path; signaturePngBase64 is the rasterised
   * finger signature. Either may be absent.
   */
  async commitConsentAssets(
    ref: string,
    photoSource: string | null,
    signaturePngBase64: string | null,
  ): Promise<{ photoUri: string | null; signaturePngUri: string | null }> {
    await ensureDir(consentDir);
    let photoUri: string | null = null;
    let signaturePngUri: string | null = null;

    if (photoSource) {
      photoUri = files.committedPhotoPath(ref);
      await files.deleteIfExists(photoUri);
      await FileSystem.copyAsync({ from: photoSource, to: photoUri });
    }
    if (signaturePngBase64) {
      signaturePngUri = files.signaturePath(ref);
      await files.writeBase64Png(signaturePngUri, signaturePngBase64);
    }
    return { photoUri, signaturePngUri };
  },

  /** Delete the ref-keyed biometric files (revoke / invalidate). */
  async deleteConsentAssets(ref: string) {
    await files.deleteIfExists(files.committedPhotoPath(ref));
    await files.deleteIfExists(files.signaturePath(ref));
  },
};
