import { Router } from 'express';
import { PermissionsController } from '../controllers/permissions.controller';
import { authenticate } from '../middleware/auth';

export const permissionsRouter = Router();

permissionsRouter.use(authenticate);
permissionsRouter.get('/', PermissionsController.listPermissions);
