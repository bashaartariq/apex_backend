import { Router } from 'express';
import { StockTakesController } from '../controllers/stock-takes.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/authorize';

export const stockTakesRouter = Router();

stockTakesRouter.use(authenticate);

// View sessions & items
stockTakesRouter.get('/', requirePermission('inventory.view'), StockTakesController.list);
stockTakesRouter.get('/:id', requirePermission('inventory.view'), StockTakesController.getById);

// Create / update / finalize physical counts - require inventory.manage / SHOP_ADMIN
stockTakesRouter.post('/', requireRole('SHOP_ADMIN'), StockTakesController.create);
stockTakesRouter.put('/:id/counts', requirePermission('inventory.manage'), StockTakesController.updateCounts);
stockTakesRouter.post('/:id/finalize', requireRole('SHOP_ADMIN'), StockTakesController.finalize);
stockTakesRouter.post('/:id/cancel', requireRole('SHOP_ADMIN'), StockTakesController.cancel);
