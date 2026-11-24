import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/authorize';
import {
  searchPosProducts,
  checkout,
  listSales,
  getSaleById,
  downloadInvoicePdf,
  reverseSale,
} from '../controllers/sales.controller';

export const salesRouter = Router();

salesRouter.use(authenticate);

salesRouter.get('/pos/search', requirePermission('pos.access'), searchPosProducts);
salesRouter.post('/checkout', requirePermission('pos.access'), checkout);
salesRouter.get('/', requirePermission('pos.access'), listSales);
salesRouter.get('/:id', requirePermission('pos.access'), getSaleById);
salesRouter.get('/:id/invoice/pdf', requirePermission('pos.access'), downloadInvoicePdf);
salesRouter.post('/:id/reverse', requireRole('SHOP_ADMIN'), reverseSale);
