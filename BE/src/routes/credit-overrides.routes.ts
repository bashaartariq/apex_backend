import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/authorize';
import {
  requestCreditOverride,
  listCreditOverrides,
  reviewCreditOverride,
} from '../controllers/credit-overrides.controller';

export const creditOverridesRouter = Router();

creditOverridesRouter.use(authenticate);

creditOverridesRouter.post('/request', requirePermission('pos.access'), requestCreditOverride);
creditOverridesRouter.get('/', requirePermission('pos.access'), listCreditOverrides);
creditOverridesRouter.post('/:id/review', requireRole('SHOP_ADMIN'), reviewCreditOverride);
