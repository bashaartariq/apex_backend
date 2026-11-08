import { Router } from 'express';
import { healthRouter } from './health.routes';
import { versionRouter } from './version.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/version', versionRouter);
