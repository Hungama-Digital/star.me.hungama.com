// src/starme/data/orderRepo.ts
// Port of OrderRepository.kt. The non-negotiable lives here: no order is created
// without a valid, unrevoked consent ref. The FK enforces it too, but we fail
// fast with a clear reason before any money moves.
import { getDb, isValidConsent, type ConsentRow, type OrderRow } from './db';

export const orderRepo = {
  async byId(id: number): Promise<OrderRow | null> {
    const db = await getDb();
    return (await db.getFirstAsync<OrderRow>('SELECT * FROM orders WHERE id = ?', id)) ?? null;
  },

  /**
   * Creates a PENDING order after verifying consent. Returns the new local row id,
   * or throws with a readable reason (used by the store to block the flow).
   */
  async createOrder(input: {
    consentRef: string;
    shellId: string;
    roleId: string;
    packageId: string;
    episodesUnlocked: number;
  }): Promise<number> {
    const db = await getDb();
    const consent = await db.getFirstAsync<ConsentRow>(
      'SELECT * FROM consent_records WHERE ref = ?',
      input.consentRef,
    );
    if (!consent) throw new Error('No consent on record for this order.');
    if (!isValidConsent(consent))
      throw new Error(`Consent ${input.consentRef} is revoked or incomplete.`);

    const result = await db.runAsync(
      `INSERT INTO orders
        (consentRef, shellId, roleId, packageId, episodesUnlocked, status, createdAt, readyAt)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NULL)`,
      input.consentRef,
      input.shellId,
      input.roleId,
      input.packageId,
      input.episodesUnlocked,
      Date.now(),
    );
    return result.lastInsertRowId;
  },

  async markRendering(id: number): Promise<void> {
    const db = await getDb();
    await db.runAsync('UPDATE orders SET status = ?, readyAt = NULL WHERE id = ?', 'RENDERING', id);
  },

  async markReady(id: number): Promise<void> {
    const db = await getDb();
    await db.runAsync('UPDATE orders SET status = ?, readyAt = ? WHERE id = ?', 'READY', Date.now(), id);
  },

  /** Deletes the pending order after a remote failure, so the two stores never diverge. */
  async discardPending(id: number): Promise<void> {
    const db = await getDb();
    await db.runAsync("DELETE FROM orders WHERE id = ? AND status = 'PENDING'", id);
  },
};
