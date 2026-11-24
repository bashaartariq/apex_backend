import { Router } from 'express';
import { AccessoriesController } from '../controllers/accessories.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';

export const accessoriesRouter = Router();

accessoriesRouter.use(authenticate);

accessoriesRouter.get('/categories', requirePermission('accessories.view'), AccessoriesController.listCategories);
accessoriesRouter.post('/categories', requirePermission('accessories.manage'), AccessoriesController.createCategory);
accessoriesRouter.get('/', requirePermission('accessories.view'), AccessoriesController.listAccessories);
accessoriesRouter.get('/:id', requirePermission('accessories.view'), AccessoriesController.getAccessory);
accessoriesRouter.get('/:id/history', requirePermission('accessories.view'), AccessoriesController.getHistory);
accessoriesRouter.post('/', requirePermission('accessories.manage'), AccessoriesController.createAccessory);
accessoriesRouter.put('/:id', requirePermission('accessories.manage'), AccessoriesController.updateAccessory);
