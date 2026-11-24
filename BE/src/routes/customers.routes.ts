import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/authorize';
import {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  getCustomerStatement,
  lookupCustomerByCnic,
  revealCustomerCnic,
} from '../controllers/customers.controller';

export const customersRouter = Router();

customersRouter.use(authenticate);

customersRouter.get('/', requirePermission('customers.view'), listCustomers);
customersRouter.get('/lookup/cnic/:cnic', requirePermission('customers.view'), lookupCustomerByCnic);
customersRouter.get('/:id', requirePermission('customers.view'), getCustomerById);
customersRouter.get('/:id/statement', requirePermission('customers.view'), getCustomerStatement);
customersRouter.get('/:id/reveal-cnic', requireRole('SHOP_ADMIN'), revealCustomerCnic);

customersRouter.post('/', requirePermission('customers.manage'), createCustomer);
customersRouter.put('/:id', requirePermission('customers.manage'), updateCustomer);
