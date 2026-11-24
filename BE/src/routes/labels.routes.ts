import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import {
  lookupProductByIdentifier,
  generateLabelPdf,
} from '../controllers/labels.controller';

export const labelsRouter = Router();

labelsRouter.use(authenticate);

labelsRouter.get('/lookup/:identifier', requirePermission('pos.access'), lookupProductByIdentifier);
labelsRouter.post('/generate-pdf', requirePermission('inventory.view'), generateLabelPdf);
