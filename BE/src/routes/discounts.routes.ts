import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/authorize';
import {
  requestDiscount,
  listDiscountRequests,
  reviewDiscountRequest,
} from '../controllers/discounts.controller';

export const discountsRouter = Router();

discountsRouter.use(authenticate);

discountsRouter.post('/request', requirePermission('pos.access'), requestDiscount);
discountsRouter.get('/', requirePermission('pos.access'), listDiscountRequests);
discountsRouter.post('/:id/review', requireRole('SHOP_ADMIN'), reviewDiscountRequest);
