// src/starme/data/walletRepo.ts
// Port of WalletRepository.kt. Wallet row id is always 1. Read through a
// subscription so the top-bar chip and the Package screen always agree.
import { getDb } from './db';

type Listener = (credits: number) => void;
const listeners = new Set<Listener>();
let current = 0;

function notify() {
  for (const l of listeners) l(current);
}

async function readCredits(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ credits: number }>('SELECT credits FROM wallet WHERE id = 1');
  return row?.credits ?? 0;
}

export const walletRepo = {
  /** Inserts credits = 0 if the row is absent. */
  async ensureInitialized(): Promise<void> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ credits: number }>(
      'SELECT credits FROM wallet WHERE id = 1',
    );
    if (!row) {
      await db.runAsync('INSERT INTO wallet (id, credits) VALUES (1, 0)');
      current = 0;
    } else {
      current = row.credits;
    }
    notify();
  },

  async credits(): Promise<number> {
    current = await readCredits();
    return current;
  },

  /** delta may be negative. Credits are debited only after the server accepts an order. */
  async add(delta: number): Promise<void> {
    const db = await getDb();
    await walletRepo.ensureInitialized();
    await db.runAsync('UPDATE wallet SET credits = credits + ? WHERE id = 1', delta);
    current = await readCredits();
    notify();
  },

  /** Debits cost atomically; returns false (no change) if the balance is short. */
  async tryDebit(cost: number): Promise<boolean> {
    const db = await getDb();
    await walletRepo.ensureInitialized();
    let ok = false;
    await db.withTransactionAsync(async () => {
      const row = await db.getFirstAsync<{ credits: number }>(
        'SELECT credits FROM wallet WHERE id = 1',
      );
      const bal = row?.credits ?? 0;
      if (bal < cost) return;
      await db.runAsync('UPDATE wallet SET credits = credits - ? WHERE id = 1', cost);
      ok = true;
    });
    current = await readCredits();
    notify();
    return ok;
  },

  /** Emits the current balance immediately, then on every mutation. Returns unsubscribe. */
  subscribe(cb: Listener): () => void {
    listeners.add(cb);
    cb(current);
    return () => listeners.delete(cb);
  },

  getCurrent: () => current,
};
