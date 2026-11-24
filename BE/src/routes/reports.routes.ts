import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/authorize';
import { asyncHandler } from '../utils/asyncHandler';
import {
  getSalesReports,
  getPurchasesReports,
  getInventoryReports,
  getProfitReports,
  getCustomerCreditReports,
  getReturnsWarrantyReports,
  exportCsv,
  exportPdf,
} from '../controllers/reports.controller';

export const reportsRouter = Router();

reportsRouter.use(authenticate);

// Reports viewing endpoints
reportsRouter.get('/sales', requirePermission('reports.view'), asyncHandler(getSalesReports));
reportsRouter.get('/purchases', requireRole('SHOP_ADMIN'), asyncHandler(getPurchasesReports));
reportsRouter.get('/inventory', requirePermission('reports.view'), asyncHandler(getInventoryReports));
reportsRouter.get('/profit', requireRole('SHOP_ADMIN'), asyncHandler(getProfitReports));
reportsRouter.get('/customers', requirePermission('reports.view'), asyncHandler(getCustomerCreditReports));
reportsRouter.get('/returns-warranty', requirePermission('reports.view'), asyncHandler(getReturnsWarrantyReports));

// Export endpoints
reportsRouter.get('/export/csv', requirePermission('reports.view'), asyncHandler(exportCsv));
reportsRouter.get('/export/pdf', requirePermission('reports.view'), asyncHandler(exportPdf));
