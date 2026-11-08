import Database from 'better-sqlite3';
import { execute } from '../query';

export interface Seed {
  id: string;
  description: string;
  run: (db: Database.Database) => void;
}

/**
 * Step 1 Foundation Seed:
 * Records baseline system metadata using parameterized queries.
 * Does not insert premature business entities.
 */
export const seed001SystemMetadata: Seed = {
  id: '001_system_metadata',
  description: 'Seed baseline application and multi-tenant architecture metadata',
  run(db: Database.Database): void {
    const now = new Date().toISOString();
    const entries: Array<[string, string]> = [
      ['application_name', 'Mobile Shop Management System'],
      ['tenancy_architecture', 'shared_database_shop_id'],
      ['foundation_stage', 'step_1_completed'],
    ];

    for (const [key, value] of entries) {
      execute(
        `INSERT INTO _system_metadata (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
        [key, value, now],
        db
      );
    }
  },
};
