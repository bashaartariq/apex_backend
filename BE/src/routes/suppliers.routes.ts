import { Router } from 'express';
import { SuppliersController } from '../controllers/suppliers.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';

export const suppliersRouter = Router();

suppliersRouter.use(authenticate);

suppliersRouter.get('/', requirePermission('suppliers.view'), SuppliersController.listSuppliers);
suppliersRouter.get('/:id', requirePermission('suppliers.view'), SuppliersController.getSupplier);
suppliersRouter.post('/', requirePermission('suppliers.manage'), SuppliersController.createSupplier);
suppliersRouter.put('/:id', requirePermission('suppliers.manage'), SuppliersController.updateSupplier);
suppliersRouter.patch('/:id/status', requirePermission('suppliers.manage'), SuppliersController.updateStatus);
