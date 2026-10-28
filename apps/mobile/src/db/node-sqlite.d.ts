/**
 * Minimal typing for the Node built-in used by migration tests. The app
 * tsconfig deliberately excludes the full Node type surface, so the test suite
 * declares only the synchronous API it needs.
 */
declare module 'node:sqlite' {
  export interface StatementResultingChanges {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
  }

  export interface StatementColumn {
    readonly name: string;
  }

  export class StatementSync {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): StatementResultingChanges;
    columns(): StatementColumn[];
  }

  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
