import { Router } from 'express';
import { ShopController } from '../controllers/shop.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/authorize';

export const shopRouter = Router();

shopRouter.use(authenticate);

shopRouter.get('/profile', ShopController.getProfile);
shopRouter.put('/profile', requireRole('SHOP_ADMIN'), ShopController.updateProfile);
shopRouter.get('/tax-settings', ShopController.getTaxSettings);
shopRouter.put('/tax-settings', requireRole('SHOP_ADMIN'), ShopController.updateTaxSettings);
