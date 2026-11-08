import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { env } from './env';
import { logger } from '../utils/logger';

let dbInstance: Database.Database | null = null;

/**
 * Opens or returns the singleton SQLite database connection.
 * Configures WAL mode, busy timeout, and strictly enables foreign key constraints.
 */
export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = path.dirname(env.databasePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(env.databasePath);

  // Configure SQLite operational & integrity pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  const fkEnabled = db.pragma('foreign_keys', { simple: true });
  if (fkEnabled !== 1) {
    db.close();
    throw new Error('Failed to enable SQLite foreign_keys enforcement.');
  }

  dbInstance = db;
  logger.info('SQLite database connection initialized', {
    databasePath: env.databasePath,
    foreignKeys: true,
  });

  return dbInstance;
}

/**
 * Cleanly closes the active SQLite connection on server shutdown.
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    logger.info('SQLite database connection closed');
  }
}
