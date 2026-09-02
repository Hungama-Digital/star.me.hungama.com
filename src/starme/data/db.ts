// src/starme/data/db.ts
// SQLite schema + init, replacing Room. 1:1 with Entities.kt / guide section 9.2.
// foreign_keys must be enabled per connection (Room does this automatically).
import * as SQLite from 'expo-sqlite';

export interface ConsentRow {
  ref: string;
  name: string;
  photoUri: string | null;
  signaturePngUri: string | null;
  consentVersion: string;
  checkedA: number; // 0 | 1
  checkedB: number; // 0 | 1
  signedAtEpoch: number;
  revokedAtEpoch: number | null;
}

export interface OrderRow {
  id: number;
  consentRef: string;
  shellId: string;
  roleId: string;
  packageId: string;
  episodesUnlocked: number;
  status: string; // PENDING | RENDERING | READY
  createdAt: number;
  readyAt: number | null;
}

export interface DownloadRow {
  orderId: number;
  shellId: string;
  epNumber: number;
  localUri: string;
  downloadedAt: number;
}

/** Matches ConsentRecord.isValid: checkedA && checkedB && revokedAtEpoch == null. */
export const isValidConsent = (r: ConsentRow | null | undefined): boolean =>
  !!r && r.checkedA === 1 && r.checkedB === 1 && r.revokedAtEpoch == null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS consent_records (
  ref               TEXT PRIMARY KEY NOT NULL,
  name              TEXT NOT NULL,
  photoUri          TEXT,
  signaturePngUri   TEXT,
  consentVersion    TEXT NOT NULL,
  checkedA          INTEGER NOT NULL,
  checkedB          INTEGER NOT NULL,
  signedAtEpoch     INTEGER NOT NULL,
  revokedAtEpoch    INTEGER
);

CREATE TABLE IF NOT EXISTS wallet (
  id      INTEGER PRIMARY KEY NOT NULL,
  credits INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  consentRef       TEXT NOT NULL,
  shellId          TEXT NOT NULL,
  roleId           TEXT NOT NULL,
  packageId        TEXT NOT NULL,
  episodesUnlocked INTEGER NOT NULL,
  status           TEXT NOT NULL,
  createdAt        INTEGER NOT NULL,
  readyAt          INTEGER,
  FOREIGN KEY (consentRef) REFERENCES consent_records(ref) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_orders_consentRef ON orders(consentRef);

CREATE TABLE IF NOT EXISTS downloaded_episodes (
  orderId      INTEGER NOT NULL,
  shellId      TEXT NOT NULL,
  epNumber     INTEGER NOT NULL,
  localUri     TEXT NOT NULL,
  downloadedAt INTEGER NOT NULL,
  PRIMARY KEY (orderId, epNumber)
);
CREATE INDEX IF NOT EXISTS idx_dl_orderId ON downloaded_episodes(orderId);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function init(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('starme.db');
  await db.execAsync(SCHEMA);
  return db;
}

/** Opens (once) and returns the shared database, with the schema ensured. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}
