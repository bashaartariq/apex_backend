import { Router } from 'express';
import { healthRouter } from './health.routes';
import { versionRouter } from './version.routes';
import { authRouter } from './auth.routes';
import { shopRouter } from './shop.routes';
import { usersRouter } from './users.routes';
import { permissionsRouter } from './permissions.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/version', versionRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/shop', shopRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/permissions', permissionsRouter);
