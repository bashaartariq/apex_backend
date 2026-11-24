import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import {
  recordSalePayment,
  listReceipts,
  getReceiptById,
  downloadReceiptPdf,
} from '../controllers/payments.controller';

export const paymentsRouter = Router();

paymentsRouter.use(authenticate);

paymentsRouter.post('/sales/:id/payments', requirePermission('pos.access'), recordSalePayment);
paymentsRouter.get('/receipts', requirePermission('pos.access'), listReceipts);
paymentsRouter.get('/receipts/:id', requirePermission('pos.access'), getReceiptById);
paymentsRouter.get('/receipts/:id/pdf', requirePermission('pos.access'), downloadReceiptPdf);
