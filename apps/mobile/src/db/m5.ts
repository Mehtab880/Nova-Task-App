import type { DB, QueryResult, Scalar, Transaction } from '@op-engineering/op-sqlite';

import { AppError } from '@/core/errors/AppError';
import { openNovaDatabase } from '@/db/client';

import { migrateDatabase, seedDefaults, type MigrationReport } from './migrations';

export type SqliteRow = Readonly<Record<string, unknown>>;
export type SqliteValue = string | number | null;

/**
 * The narrow capability repositories need. Both `DB` and `Transaction` satisfy
 * it, so repository functions can run standalone or inside a transaction
 * without casting and without starting a nested serialized write.
 */
export interface DbExecutor {
  execute(query: string, params?: Scalar[]): Promise<QueryResult>;
}

export type DbTransactionExecutor = Pick<Transaction, 'execute'>;

let schemaReady: Promise<MigrationReport> | null = null;
let serialQueue: Promise<void> = Promise.resolve();

/** Runs writes in order so UI actions cannot interleave partially. */
export function serializeM5<T>(task: () => Promise<T>): Promise<T> {
  const run = serialQueue.then(task, task);
  serialQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function ensureSchemaUnlocked(): Promise<MigrationReport> {
  const db = await openNovaDatabase();
  const report = await migrateDatabase(db);
  await seedDefaults(db, deviceTimeZone());
  return report;
}

/**
 * Opens the database and guarantees the M5 schema. The promise is reset on
 * failure so a transient open error does not permanently brick the app.
 */
export function ensureM5Schema(): Promise<MigrationReport> {
  schemaReady ??= ensureSchemaUnlocked().catch(error => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function database(): Promise<DB> {
  await ensureM5Schema();
  return openNovaDatabase();
}

export async function m5Transaction<T>(work: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return serializeM5(async () => {
    const db = await database();
    const holder: { value?: T } = {};
    await db.transaction(async tx => {
      holder.value = await work(tx);
    });
    if (!('value' in holder)) {
      throw new AppError({
        code: 'm5_transaction_empty',
        category: 'storage',
        message: 'A database transaction completed without a result',
      });
    }
    return holder.value;
  });
}

export async function m5Read<T>(work: (db: DbExecutor) => Promise<T>): Promise<T> {
  return serializeM5(async () => work(await database()));
}

export function textValue(row: SqliteRow, key: string): string {
  const value = row[key];
  if (typeof value === 'string') return value;
  throw new AppError({
    code: 'row_column_not_text',
    category: 'storage',
    message: `Column ${key} is not text`,
    context: { key, valueType: typeof value },
  });
}

export function nullableText(row: SqliteRow, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

export function numberValue(row: SqliteRow, key: string): number {
  const value = row[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  throw new AppError({
    code: 'row_column_not_numeric',
    category: 'storage',
    message: `Column ${key} is not numeric`,
    context: { key, valueType: typeof value },
  });
}

export function nullableNumber(row: SqliteRow, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function booleanValue(row: SqliteRow, key: string): boolean {
  const value = row[key];
  return value === 1 || value === true || value === '1';
}

export function toBoolean(value: boolean): number {
  return value ? 1 : 0;
}

export function nullable(value: string | number | null | undefined): SqliteValue {
  return value === undefined ? null : value;
}
