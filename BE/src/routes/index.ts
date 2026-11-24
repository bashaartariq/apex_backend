import { Router } from 'express';
import { healthRouter } from './health.routes';
import { versionRouter } from './version.routes';
import { authRouter } from './auth.routes';
import { shopRouter } from './shop.routes';
import { usersRouter } from './users.routes';
import { permissionsRouter } from './permissions.routes';
import { suppliersRouter } from './suppliers.routes';
import { phonesRouter } from './phones.routes';
import { accessoriesRouter } from './accessories.routes';
import { stockRouter } from './stock.routes';
import { purchasesRouter } from './purchases.routes';
import { stockTakesRouter } from './stock-takes.routes';
import { customersRouter } from './customers.routes';
import { discountsRouter } from './discounts.routes';
import { creditOverridesRouter } from './credit-overrides.routes';
import { salesRouter } from './sales.routes';
import { paymentsRouter } from './payments.routes';
import { returnsRouter } from './returns.routes';
import { warrantyRouter } from './warranty.routes';
import { labelsRouter } from './labels.routes';
import { dashboardRouter } from './dashboard.routes';
import { reportsRouter } from './reports.routes';
import { searchRouter } from './search.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/version', versionRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/shop', shopRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/permissions', permissionsRouter);

// Step 3: Inventory & Purchasing routes
apiRouter.use('/suppliers', suppliersRouter);
apiRouter.use('/inventory/phones', phonesRouter);
apiRouter.use('/inventory/accessories', accessoriesRouter);
apiRouter.use('/inventory', stockRouter);
apiRouter.use('/purchases', purchasesRouter);
apiRouter.use('/stock-takes', stockTakesRouter);

// Step 4: POS, Sales & Customer Management routes
apiRouter.use('/customers', customersRouter);
apiRouter.use('/discounts', discountsRouter);
apiRouter.use('/credit-overrides', creditOverridesRouter);
apiRouter.use('/sales', salesRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/returns', returnsRouter);
apiRouter.use('/warranty', warrantyRouter);
apiRouter.use('/products', labelsRouter);

// Step 5: Dashboard, Reports & Analytics routes
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/search', searchRouter);
