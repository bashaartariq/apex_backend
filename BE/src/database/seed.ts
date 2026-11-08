import { getDatabase, closeDatabase } from '../config/database';
import { execute, queryAll, withTransaction } from './query';
import { runMigrations } from './migrate';
import { Seed, seed001SystemMetadata } from './seeds/001_system_metadata';
import { logger } from '../utils/logger';

const SEEDS: readonly Seed[] = [seed001SystemMetadata];

function ensureSeedsTable(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS _seeds (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function runSeeds(): { executed: string[]; total: number } {
  // Ensure migrations are applied before seeding
  runMigrations();
  ensureSeedsTable();

  const existingRows = queryAll<{ id: string }>('SELECT id FROM _seeds ORDER BY id ASC');
  const executedSet = new Set(existingRows.map((row) => row.id));
  const newlyExecuted: string[] = [];

  for (const seed of SEEDS) {
    withTransaction((db) => {
      seed.run(db);
      execute(
        `INSERT INTO _seeds (id, description, executed_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET executed_at = excluded.executed_at`,
        [seed.id, seed.description, new Date().toISOString()],
        db
      );
    });

    if (!executedSet.has(seed.id)) {
      newlyExecuted.push(seed.id);
    }
    logger.info('Executed database seed', { id: seed.id, description: seed.description });
  }

  return {
    executed: newlyExecuted,
    total: new Set([...executedSet, ...newlyExecuted]).size,
  };
}

if (require.main === module) {
  try {
    const result = runSeeds();
    logger.info('Seed run completed', {
      newlyExecutedCount: result.executed.length,
      totalSeedsTracked: result.total,
    });
    closeDatabase();
  } catch (error) {
    logger.error('Seed run failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    closeDatabase();
    process.exit(1);
  }
}
