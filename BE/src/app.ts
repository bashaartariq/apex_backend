import express, { Application } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { attachTenantContext } from './middleware/tenantContext';
import { apiRouter } from './routes';
import { notFoundHandler } from './middleware/notFoundHandler';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');

  const allowedOrigins = env.frontendUrl
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Shop-Id'],
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Multi-tenant request context foundation
  app.use(attachTenantContext);

  // REST API routes
  app.use('/api', apiRouter);

  // 404 & centralized error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
