import { createApp } from './app';
import { env } from './config/env';
import { getDatabase, closeDatabase } from './config/database';
import { runMigrations } from './database/migrate';
import { logger } from './utils/logger';

function bootstrap(): void {
  try {
    // Initialize SQLite connection and ensure baseline migrations are applied
    getDatabase();
    runMigrations();

    const app = createApp();
    const server = app.listen(env.port, '127.0.0.1', () => {
      logger.info('Backend server started', {
        environment: env.nodeEnv,
        port: env.port,
        healthEndpoint: `http://localhost:${env.port}/api/health`,
        versionEndpoint: `http://localhost:${env.port}/api/version`,
      });
    });

    const shutdown = (signal: string): void => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        closeDatabase();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.error('Failed to bootstrap backend server', {
      error: error instanceof Error ? error.stack || error.message : String(error),
    });
    closeDatabase();
    process.exit(1);
  }
}

bootstrap();
