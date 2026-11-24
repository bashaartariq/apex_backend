import { Router } from 'express';
import { StockController } from '../controllers/stock.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/authorize';

export const stockRouter = Router();

stockRouter.use(authenticate);

// Overview / Dashboard summary - all shop staff with inventory.view
stockRouter.get('/stock-summary', requirePermission('inventory.view'), StockController.getSummary);

// Low-stock alerts
stockRouter.get('/low-stock', requirePermission('inventory.view'), StockController.listLowStock);

// Stock movements audit log
stockRouter.get('/movements', requirePermission('inventory.view'), StockController.listMovements);

// Manual stock adjustment - strictly for shop admin
stockRouter.post('/adjustments', requireRole('SHOP_ADMIN'), StockController.adjustStock);
