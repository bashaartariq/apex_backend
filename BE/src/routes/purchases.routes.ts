import { Router } from 'express';
import { PurchasesController } from '../controllers/purchases.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/authorize';

export const purchasesRouter = Router();

purchasesRouter.use(authenticate);

purchasesRouter.get('/', requirePermission('purchases.view'), PurchasesController.listPurchases);
purchasesRouter.get('/:id', requirePermission('purchases.view'), PurchasesController.getPurchase);

// Purchases creation and confirmation are restricted to SHOP_ADMIN
purchasesRouter.post('/', requireRole('SHOP_ADMIN'), PurchasesController.createPurchase);
purchasesRouter.post('/:id/confirm', requireRole('SHOP_ADMIN'), PurchasesController.confirmPurchase);
