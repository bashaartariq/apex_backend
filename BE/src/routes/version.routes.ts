import { Router } from 'express';
import { systemController } from '../controllers/system.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const versionRouter = Router();

versionRouter.get('/', asyncHandler(systemController.getVersion));
