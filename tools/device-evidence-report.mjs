#!/usr/bin/env node
/**
 * Summarise a pulled Nova Task database for device verification evidence.
 *
 * Usage: node tools/device-evidence-report.mjs <directory containing nova.db>
 *
 * The directory must contain nova.db plus its nova.db-wal and nova.db-shm
 * companions, because op-sqlite runs in WAL mode and rows can live only in the
 * write-ahead log until a checkpoint runs.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'artifacts/device');
const dbPath = join(dir, 'nova.db');

if (!existsSync(dbPath)) {
  console.error(`No nova.db in ${dir}. Pull it first.`);
  process.exit(1);
}

for (const companion of ['nova.db-wal', 'nova.db-shm']) {
  if (!existsSync(join(dir, companion))) {
    console.warn(`warning: ${companion} missing; uncommitted rows may be invisible`);
  }
}

const db = new DatabaseSync(dbPath);

function tables() {
  return db
    .prepare("select name from sqlite_master where type='table' order by name")
    .all()
    .map(row => row.name);
}

function tryAll(sql) {
  try {
    return db.prepare(sql).all();
  } catch (error) {
    return [{ error: error.message }];
  }
}

function printSection(title, sql, limit = 12) {
  const rows = tryAll(sql);
  console.log(`\n## ${title} (${rows.length})`);
  for (const row of rows.slice(0, limit)) console.log(JSON.stringify(row));
  if (rows.length > limit) console.log(`... ${rows.length - limit} more`);
}

const schema = tables();
console.log(`db: ${dbPath}`);
console.log(`tables (${schema.length}): ${schema.join(', ')}`);

printSection(
  'tasks',
  `select id, title, status, due_date, due_time, priority, list_id, series_id,
          deleted_at, archived_at, completed_at
     from task
    order by created_at desc`,
);
printSection(
  'reminders',
  `select id, task_id, kind, offset_minutes, local_date, local_time, is_exact,
          status, snooze_until, label
     from reminder
    order by created_at desc`,
);
printSection(
  'notification_schedule',
  `select id, task_id, reminder_id, occurrence_id, local_date, local_time,
          timezone, scheduled_at, state, reason, request_code, is_exact_requested
     from notification_schedule
    order by scheduled_at`,
);
printSection(
  'reminder_event',
  `select id, task_id, reminder_id, schedule_id, type, detail, created_at
     from reminder_event
    order by created_at desc`,
  8,
);
printSection(
  'recurrence_rule',
  `select id, task_id, frequency, interval, weekdays, monthly_mode, month_day,
          nth, weekday, start_date, end_date, end_after_count, completed_count,
          repeat_after_completion, is_active
     from recurrence_rule`,
);
printSection(
  'recurrence_occurrence',
  `select id, rule_id, task_id, occurrence_date, occurrence_time, status,
          is_exception, scheduled_at
     from recurrence_occurrence
    order by occurrence_date`,
);
printSection('subtasks', `select id, task_id, title, is_completed, deleted_at from subtask`);

console.log('\n## counts');
for (const name of [
  'task',
  'reminder',
  'notification_schedule',
  'reminder_event',
  'recurrence_rule',
  'recurrence_occurrence',
  'subtask',
  'list',
]) {
  const row = tryAll(`select count(*) as count from "${name}"`)[0];
  console.log(`${name}: ${row?.count ?? 'n/a'}`);
}
