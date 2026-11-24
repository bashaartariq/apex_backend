import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/authorize';
import { asyncHandler } from '../utils/asyncHandler';
import { getAdminDashboard, getShopkeeperDashboard } from '../controllers/dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get('/admin', requireRole('SHOP_ADMIN'), asyncHandler(getAdminDashboard));
dashboardRouter.get('/shopkeeper', requirePermission('dashboard.view'), asyncHandler(getShopkeeperDashboard));
