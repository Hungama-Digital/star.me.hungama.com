// src/starme/services/poster.ts
// Rasterise a PosterView ref to a 900x1350 PNG (base64) and, on demand, to a file.
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { POSTER_H, POSTER_W } from '../components/PosterView';
import { files } from '../data/files';

export async function capturePosterBase64(ref: React.RefObject<View | null>): Promise<string | null> {
  if (!ref.current) return null;
  try {
    return await captureRef(ref, { format: 'png', result: 'base64', width: POSTER_W, height: POSTER_H });
  } catch {
    return null;
  }
}

/** Write a base64 poster to <documents>/posters/StarME_{ref}.png and return the file uri. */
export async function writePosterFile(refKey: string, base64: string): Promise<string> {
  const path = files.posterPath(refKey);
  await files.writeBase64Png(path, base64);
  return path;
}
