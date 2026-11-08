import Database from 'better-sqlite3';

export interface Migration {
  id: string;
  description: string;
  up: (db: Database.Database) => void;
}

/**
 * Step 1 Foundation Migration:
 * Creates only the minimal system metadata table needed to verify schema versioning
 * and multi-tenant readiness. Business tables (shops, users, inventory, POS) are
 * intentionally deferred to later approved steps.
 */
export const migration001InitInfrastructure: Migration = {
  id: '001_init_infrastructure',
  description: 'Initialize system metadata store for shared multi-tenant database foundation',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS _system_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};
