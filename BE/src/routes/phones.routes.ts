import { Router } from 'express';
import { PhonesController } from '../controllers/phones.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';

export const phonesRouter = Router();

phonesRouter.use(authenticate);

phonesRouter.get('/', requirePermission('phones.view'), PhonesController.listPhones);
phonesRouter.get('/lookup/:imei', requirePermission('phones.view'), PhonesController.lookupImei);
phonesRouter.get('/:id', requirePermission('phones.view'), PhonesController.getPhone);
phonesRouter.post('/', requirePermission('phones.manage'), PhonesController.createPhone);
phonesRouter.put('/:id', requirePermission('phones.manage'), PhonesController.updatePhone);
