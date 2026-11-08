import { Router } from 'express';
import { systemController } from '../controllers/system.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const healthRouter = Router();

healthRouter.get('/', asyncHandler(systemController.getHealth));
