import { getDatabase } from '../config/database';
import { env } from '../config/env';
import { queryOne } from '../database/query';
import packageJson from '../../package.json';

export interface HealthStatus {
  success: boolean;
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  database: {
    connected: boolean;
    engine: 'sqlite';
    foreignKeysEnabled: boolean;
    appliedMigrations: number;
  };
  tenancy: {
    mode: 'shared-database';
    discriminator: 'shop_id';
  };
}

export interface VersionInfo {
  success: boolean;
  name: string;
  version: string;
  apiPrefix: string;
  stage: string;
  environment: string;
  nodeVersion: string;
}

export const systemService = {
  getHealthStatus(): HealthStatus {
    const db = getDatabase();

    // Verify live parameterized SQLite read
    const pingRow = queryOne<{ ok: number }>('SELECT ? AS ok', [1], db);
    const fkPragma = db.pragma('foreign_keys', { simple: true });

    let appliedMigrations = 0;
    const migrationsTableExists = queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = ? AND name = ?",
      ['table', '_migrations'],
      db
    );

    if (migrationsTableExists) {
      const countRow = queryOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM _migrations',
        undefined,
        db
      );
      appliedMigrations = countRow?.count ?? 0;
    }

    const dbHealthy = pingRow?.ok === 1 && fkPragma === 1;

    return {
      success: dbHealthy,
      status: dbHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime() * 100) / 100,
      environment: env.nodeEnv,
      database: {
        connected: pingRow?.ok === 1,
        engine: 'sqlite',
        foreignKeysEnabled: fkPragma === 1,
        appliedMigrations,
      },
      tenancy: {
        mode: 'shared-database',
        discriminator: 'shop_id',
      },
    };
  },

  getVersionInfo(): VersionInfo {
    return {
      success: true,
      name: packageJson.name,
      version: packageJson.version,
      apiPrefix: '/api',
      stage: 'Step 1 - Project Foundation',
      environment: env.nodeEnv,
      nodeVersion: process.version,
    };
  },
};
