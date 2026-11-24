import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import {
  processReturn,
  processExchange,
  listReturns,
} from '../controllers/returns.controller';

export const returnsRouter = Router();

returnsRouter.use(authenticate);

returnsRouter.post('/', requirePermission('returns.manage'), processReturn);
returnsRouter.post('/exchange', requirePermission('returns.manage'), processExchange);
returnsRouter.get('/', requirePermission('returns.manage'), listReturns);
