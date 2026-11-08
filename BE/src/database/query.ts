import Database from 'better-sqlite3';
import { getDatabase } from '../config/database';

export type SqlPrimitive = string | number | bigint | Buffer | null;
export type SqlParams = readonly SqlPrimitive[] | Record<string, SqlPrimitive>;

/**
 * Executes a parameterized SELECT query returning all matching rows.
 * Always uses prepared statements to prevent SQL injection.
 */
export function queryAll<T = Record<string, unknown>>(
  sql: string,
  params?: SqlParams,
  db: Database.Database = getDatabase()
): T[] {
  const stmt = db.prepare(sql);
  if (!params) {
    return stmt.all() as T[];
  }
  return (Array.isArray(params) ? stmt.all(...params) : stmt.all(params)) as T[];
}

/**
 * Executes a parameterized SELECT query returning a single row or undefined.
 */
export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: SqlParams,
  db: Database.Database = getDatabase()
): T | undefined {
  const stmt = db.prepare(sql);
  if (!params) {
    return stmt.get() as T | undefined;
  }
  return (Array.isArray(params) ? stmt.get(...params) : stmt.get(params)) as T | undefined;
}

/**
 * Executes a parameterized write statement (INSERT, UPDATE, DELETE).
 */
export function execute(
  sql: string,
  params?: SqlParams,
  db: Database.Database = getDatabase()
): Database.RunResult {
  const stmt = db.prepare(sql);
  if (!params) {
    return stmt.run();
  }
  return Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
}

/**
 * Wraps multi-statement database work inside an atomic SQLite IMMEDIATE transaction.
 * Automatically commits on success and rolls back if an exception is thrown.
 */
export function withTransaction<T>(
  work: (db: Database.Database) => T,
  db: Database.Database = getDatabase()
): T {
  const tx = db.transaction(() => work(db));
  return tx.immediate();
}

/**
 * Multi-tenant foundation helper: validates that a non-empty shopId discriminator
 * is supplied before running tenant-scoped queries in future business modules.
 */
export function requireShopId(shopId: string | undefined | null): string {
  const normalized = shopId?.trim();
  if (!normalized) {
    throw new Error('Missing required multi-tenant shop_id context for tenant-scoped query.');
  }
  return normalized;
}
