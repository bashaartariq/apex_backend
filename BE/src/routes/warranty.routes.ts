import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import {
  listWarranties,
  listClaims,
  createWarrantyClaim,
  updateWarrantyClaim,
} from '../controllers/warranty.controller';

export const warrantyRouter = Router();

warrantyRouter.use(authenticate);

warrantyRouter.get('/', requirePermission('warranty.manage'), listWarranties);
warrantyRouter.get('/claims', requirePermission('warranty.manage'), listClaims);
warrantyRouter.post('/claims', requirePermission('warranty.manage'), createWarrantyClaim);
warrantyRouter.put('/claims/:id', requirePermission('warranty.manage'), updateWarrantyClaim);
