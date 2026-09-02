// src/starme/data/downloadRepo.ts
// Port of DownloadRepository.kt. Insert with replace so a repeat download is safe.
import { getDb, type DownloadRow } from './db';

export const downloadRepo = {
  async insert(input: {
    orderId: number;
    shellId: string;
    epNumber: number;
    localUri: string;
  }): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO downloaded_episodes
        (orderId, shellId, epNumber, localUri, downloadedAt)
       VALUES (?, ?, ?, ?, ?)`,
      input.orderId,
      input.shellId,
      input.epNumber,
      input.localUri,
      Date.now(),
    );
  },

  async isDownloaded(orderId: number, epNumber: number): Promise<boolean> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ hit: number }>(
      'SELECT EXISTS(SELECT 1 FROM downloaded_episodes WHERE orderId = ? AND epNumber = ?) AS hit',
      orderId,
      epNumber,
    );
    return (row?.hit ?? 0) === 1;
  },

  async forOrder(orderId: number): Promise<DownloadRow[]> {
    const db = await getDb();
    return db.getAllAsync<DownloadRow>(
      'SELECT * FROM downloaded_episodes WHERE orderId = ?',
      orderId,
    );
  },

  async deleteForOrder(orderId: number): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM downloaded_episodes WHERE orderId = ?', orderId);
  },
};
