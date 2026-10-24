import { open, type DB } from '@op-engineering/op-sqlite';
import { drizzle, type OPSQLiteDatabase } from 'drizzle-orm/op-sqlite';

export const DATABASE_NAME = 'nova.db';

let connection: DB | null = null;
let opening: Promise<DB> | null = null;

function scalar(result: Awaited<ReturnType<DB['execute']>>, column: string): unknown {
  return result.rows[0]?.[column];
}

/**
 * Opens the single app database and applies the durability pragmas required
 * before any future product schema is introduced:
 * foreign_keys, WAL, synchronous=NORMAL, busy_timeout.
 */
async function openAndConfigure(): Promise<DB> {
  const db = open({ name: DATABASE_NAME, location: 'default' });

  try {
    await db.execute('PRAGMA foreign_keys = ON');
    await db.execute('PRAGMA journal_mode = WAL');
    await db.execute('PRAGMA synchronous = NORMAL');
    await db.execute('PRAGMA busy_timeout = 5000');

    const foreignKeys = scalar(await db.execute('PRAGMA foreign_keys'), 'foreign_keys');
    const journalMode = scalar(await db.execute('PRAGMA journal_mode'), 'journal_mode');

    if (Number(foreignKeys) !== 1) {
      throw new Error(`foreign_keys was not enabled (received ${String(foreignKeys)})`);
    }
    if (String(journalMode).toLowerCase() !== 'wal') {
      throw new Error(`WAL was not enabled (received ${String(journalMode)})`);
    }
  } catch (error) {
    db.close();
    throw error;
  }

  return db;
}

export async function openNovaDatabase(): Promise<DB> {
  if (connection !== null) {
    return connection;
  }

  opening ??= openAndConfigure();
  try {
    connection = await opening;
    return connection;
  } finally {
    opening = null;
  }
}

export function getNovaDrizzle(db: DB): OPSQLiteDatabase {
  return drizzle(db);
}

export async function closeNovaDatabase(): Promise<void> {
  if (connection !== null) {
    await connection.closeAsync();
    connection = null;
  }
}
