import { getDatabase, closeDatabase } from '../config/database';
import { execute, queryAll, withTransaction } from './query';
import { Migration, migration001InitInfrastructure } from './migrations/001_init_infrastructure';
import { logger } from '../utils/logger';

const MIGRATIONS: readonly Migration[] = [migration001InitInfrastructure];

function ensureMigrationsTable(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function runMigrations(): { applied: string[]; total: number } {
  ensureMigrationsTable();

  const existingRows = queryAll<{ id: string }>('SELECT id FROM _migrations ORDER BY id ASC');
  const appliedSet = new Set(existingRows.map((row) => row.id));
  const newlyApplied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.id)) {
      continue;
    }

    withTransaction((db) => {
      migration.up(db);
      execute(
        'INSERT INTO _migrations (id, description, applied_at) VALUES (?, ?, ?)',
        [migration.id, migration.description, new Date().toISOString()],
        db
      );
    });

    newlyApplied.push(migration.id);
    logger.info('Applied database migration', { id: migration.id, description: migration.description });
  }

  return {
    applied: newlyApplied,
    total: appliedSet.size + newlyApplied.length,
  };
}

if (require.main === module) {
  try {
    const result = runMigrations();
    logger.info('Migration run completed', {
      newlyAppliedCount: result.applied.length,
      totalAppliedMigrations: result.total,
    });
    closeDatabase();
  } catch (error) {
    logger.error('Migration run failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    closeDatabase();
    process.exit(1);
  }
}
