import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryOne, execute } from '../database/query';
import { AppError } from '../middleware/errorHandler';

export const updateShopSchema = z.object({
  name: z.string().trim().min(2, 'Shop name is required'),
  ownerName: z.string().trim().min(2, 'Owner name is required'),
  phone: z.string().trim().min(5, 'Phone number is required'),
  address: z.string().trim().min(3, 'Address is required'),
});

export class ShopController {
  static async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const shop = queryOne<{
        id: string;
        name: string;
        owner_name: string;
        email: string;
        phone: string;
        address: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, name, owner_name, email, phone, address, status, created_at, updated_at
         FROM shops
         WHERE id = ?`,
        [req.user.shopId]
      );

      if (!shop) {
        throw new AppError(404, 'SHOP_NOT_FOUND', 'Shop profile not found.');
      }

      res.status(200).json({
        success: true,
        data: shop,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const data = updateShopSchema.parse(req.body);
      const nowIso = new Date().toISOString();

      execute(
        `UPDATE shops
         SET name = ?, owner_name = ?, phone = ?, address = ?, updated_at = ?
         WHERE id = ?`,
        [data.name, data.ownerName, data.phone, data.address, nowIso, req.user.shopId]
      );

      const updated = queryOne(
        `SELECT id, name, owner_name, email, phone, address, status, created_at, updated_at
         FROM shops
         WHERE id = ?`,
        [req.user.shopId]
      );

      res.status(200).json({
        success: true,
        message: 'Shop profile updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}
