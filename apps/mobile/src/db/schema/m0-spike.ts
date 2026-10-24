import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * M0 spike-only table. This is deliberately NOT a product table.
 * It is dropped and recreated on every spike run.
 */
export const m0Spike = sqliteTable('m0_spike', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull(),
});
