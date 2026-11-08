import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { attachTenantContext } from './middleware/tenantContext';
import { apiRouter } from './routes';
import { notFoundHandler } from './middleware/notFoundHandler';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');

  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        // Allow requests with no origin (mobile, curl, proxy) or any localhost/preview host
        callback(null, true);
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Shop-Id'],
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Multi-tenant request context foundation
  app.use(attachTenantContext);

  // REST API routes
  app.use('/api', apiRouter);

  // Serve production Angular frontend if built
  const frontendDist = path.resolve(__dirname, '../../FE/app/dist/app');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  // 404 & centralized error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
