import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { queryOne, execute } from '../database/query';
import { AppError } from '../middleware/errorHandler';

export const updateShopSchema = z.object({
  name: z.string().trim().min(2, 'Please enter a shop name of at least 2 characters.'),
  ownerName: z.string().trim().min(2, 'Please enter the owner name.'),
  phone: z.string().trim().min(5, 'Please enter a valid phone number.'),
  address: z.string().trim().min(3, 'Please enter a valid address.'),
});

export const updateTaxSettingsSchema = z.object({
  taxEnabled: z.boolean(),
  taxRate: z.coerce.number().min(0, 'Tax rate cannot be negative.').max(100, 'Tax rate cannot exceed 100%.'),
  taxName: z.string().trim().min(1, 'Tax label is required.').max(40, 'Tax label is too long.'),
  isTaxInclusive: z.boolean().default(false),
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
        data: {
          ...shop,
          ownerName: shop.owner_name,
        },
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

      const updated = queryOne<{
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

      res.status(200).json({
        success: true,
        message: 'Shop profile updated successfully.',
        data: updated ? { ...updated, ownerName: updated.owner_name } : null,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getTaxSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const row = queryOne<{
        id: string;
        shop_id: string;
        tax_enabled: number;
        tax_rate: number;
        tax_name: string;
        is_tax_inclusive: number;
        updated_at: string;
      }>(
        `SELECT id, shop_id, tax_enabled, tax_rate, tax_name, is_tax_inclusive, updated_at
         FROM shop_tax_settings
         WHERE shop_id = ?`,
        [req.user.shopId]
      );

      res.status(200).json({
        success: true,
        data: row
          ? {
              taxEnabled: Boolean(row.tax_enabled),
              taxRate: Number(row.tax_rate) || 0,
              taxName: row.tax_name || 'GST / Sales Tax',
              isTaxInclusive: Boolean(row.is_tax_inclusive),
              updatedAt: row.updated_at,
            }
          : {
              taxEnabled: false,
              taxRate: 0,
              taxName: 'GST / Sales Tax',
              isTaxInclusive: false,
              updatedAt: null,
            },
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateTaxSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const data = updateTaxSettingsSchema.parse(req.body);
      const nowIso = new Date().toISOString();
      const id = `tax_${crypto.randomUUID()}`;

      execute(
        `INSERT INTO shop_tax_settings (id, shop_id, tax_enabled, tax_rate, tax_name, is_tax_inclusive, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(shop_id) DO UPDATE SET
           tax_enabled = excluded.tax_enabled,
           tax_rate = excluded.tax_rate,
           tax_name = excluded.tax_name,
           is_tax_inclusive = excluded.is_tax_inclusive,
           updated_at = excluded.updated_at`,
        [
          id,
          req.user.shopId,
          data.taxEnabled ? 1 : 0,
          data.taxRate,
          data.taxName,
          data.isTaxInclusive ? 1 : 0,
          nowIso,
          nowIso,
        ]
      );

      res.status(200).json({
        success: true,
        message: 'Tax configuration updated successfully.',
        data: {
          taxEnabled: data.taxEnabled,
          taxRate: data.taxRate,
          taxName: data.taxName,
          isTaxInclusive: data.isTaxInclusive,
          updatedAt: nowIso,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
