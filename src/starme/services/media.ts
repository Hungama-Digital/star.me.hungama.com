// src/starme/services/media.ts
// Gallery save (expo-media-library -> Pictures/StarME) and share (expo-sharing).
// Note: expo-sharing shares the file but does not carry an arbitrary caption string
// the way react-native-share does; the poster PNG shares cleanly.
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

export async function savePosterToGallery(fileUri: string): Promise<boolean> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return false;
    const asset = await MediaLibrary.createAssetAsync(fileUri);
    const album = await MediaLibrary.getAlbumAsync('StarME');
    if (album) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    } else {
      await MediaLibrary.createAlbumAsync('StarME', asset, false);
    }
    return true;
  } catch {
    return false;
  }
}

export async function sharePoster(fileUri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(fileUri, {
    mimeType: 'image/png',
    dialogTitle: 'Share your trailer',
    UTI: 'public.png',
  });
}
