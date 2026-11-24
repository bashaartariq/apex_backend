import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { queryAll, queryOne, execute, withTransaction } from '../database/query';
import { AppError } from '../middleware/errorHandler';

export const createAccessorySchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const rawCost = val.purchaseCost !== undefined ? val.purchaseCost : val.purchase_cost;
    const rawPrice = val.sellingPrice !== undefined ? val.sellingPrice : val.selling_price;
    const rawCat = val.categoryId !== undefined ? val.categoryId : val.category_id;
    const rawSup = val.supplierId !== undefined ? val.supplierId : val.supplier_id;
    const rawInit = val.initialQuantity !== undefined ? val.initialQuantity : val.initial_quantity;
    const rawMin = val.minStockThreshold !== undefined ? val.minStockThreshold : val.min_stock_threshold;

    return {
      ...val,
      categoryId: rawCat ? String(rawCat).trim() : undefined,
      supplierId: rawSup && String(rawSup).trim() !== '' ? String(rawSup).trim() : null,
      purchaseCost: rawCost !== undefined && rawCost !== null && rawCost !== '' ? Number(rawCost) : undefined,
      sellingPrice: rawPrice !== undefined && rawPrice !== null && rawPrice !== '' ? Number(rawPrice) : undefined,
      initialQuantity: rawInit !== undefined && rawInit !== null && rawInit !== '' ? Number(rawInit) : 0,
      minStockThreshold: rawMin !== undefined && rawMin !== null && rawMin !== '' ? Number(rawMin) : 5,
    };
  }
  return val;
}, z.object({
  name: z.string().trim().min(2, 'Please enter an accessory name of at least 2 characters.'),
  categoryId: z.string().trim().min(1, 'Please select a category.'),
  brand: z.string().trim().min(1, 'Please enter a brand name.'),
  model: z.string().trim().optional().nullable(),
  sku: z.string().trim().min(2, 'Please enter a valid SKU code (at least 2 characters).').toUpperCase(),
  barcode: z.string().trim().optional().nullable().or(z.literal('')),
  purchaseCost: z.coerce.number().min(0, 'Purchase cost cannot be negative.'),
  sellingPrice: z.coerce.number().min(0, 'Price cannot be negative.'),
  initialQuantity: z.coerce.number().int('Quantity must be an integer.').min(0, 'Quantity cannot be negative.').default(0),
  minStockThreshold: z.coerce.number().int('Stock threshold must be an integer.').min(0, 'Minimum stock threshold cannot be negative.').default(5),
  supplierId: z.string().optional().nullable().or(z.literal('')),
  description: z.string().trim().optional().nullable(),
}));

export const updateAccessorySchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const rawPrice = val.sellingPrice !== undefined ? val.sellingPrice : val.selling_price;
    const rawCat = val.categoryId !== undefined ? val.categoryId : val.category_id;
    const rawMin = val.minStockThreshold !== undefined ? val.minStockThreshold : val.min_stock_threshold;

    return {
      ...val,
      categoryId: rawCat ? String(rawCat).trim() : undefined,
      sellingPrice: rawPrice !== undefined && rawPrice !== null && rawPrice !== '' ? Number(rawPrice) : undefined,
      minStockThreshold: rawMin !== undefined && rawMin !== null && rawMin !== '' ? Number(rawMin) : undefined,
    };
  }
  return val;
}, z.object({
  name: z.string().trim().min(2).optional(),
  categoryId: z.string().trim().min(1).optional(),
  brand: z.string().trim().min(1).optional(),
  model: z.string().trim().optional().nullable(),
  barcode: z.string().trim().optional().nullable(),
  sellingPrice: z.coerce.number().min(0).optional(),
  minStockThreshold: z.coerce.number().int().min(0).optional(),
  description: z.string().trim().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}));

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Category name is required'),
});

export class AccessoriesController {
  static async listCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');

      const categories = queryAll(
        `SELECT c.*,
          (SELECT COUNT(*) FROM accessories a WHERE a.category_id = c.id AND a.shop_id = c.shop_id) as product_count
         FROM accessory_categories c
         WHERE c.shop_id = ?
         ORDER BY c.name ASC`,
        [req.user.shopId]
      );

      res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { name } = createCategorySchema.parse(req.body);

      const existing = queryOne<{ id: string }>(
        'SELECT id FROM accessory_categories WHERE shop_id = ? AND LOWER(name) = LOWER(?)',
        [req.user.shopId, name]
      );

      if (existing) {
        throw new AppError(409, 'DUPLICATE_CATEGORY', `Category "${name}" already exists.`);
      }

      const id = 'cat_' + crypto.randomUUID();
      const nowIso = new Date().toISOString();

      execute(
        `INSERT INTO accessory_categories (id, shop_id, name, created_at) VALUES (?, ?, ?, ?)`,
        [id, req.user.shopId, name, nowIso]
      );

      const created = queryOne('SELECT * FROM accessory_categories WHERE id = ?', [id]);

      res.status(201).json({
        success: true,
        message: `Category "${name}" created.`,
        data: created,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listAccessories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');

      const { categoryId, supplierId, status, search, lowStockOnly } = req.query as Record<string, string>;

      let sql = `
        SELECT a.*, c.name as category_name, s.name as supplier_name,
          CASE WHEN a.available_quantity <= a.min_stock_threshold THEN 1 ELSE 0 END as is_low_stock,
          (
            SELECT COALESCE(SUM(b.remaining_quantity * b.unit_cost), 0)
            FROM accessory_batches b
            WHERE b.accessory_id = a.id AND b.remaining_quantity > 0
          ) as fifo_valuation
        FROM accessories a
        JOIN accessory_categories c ON c.id = a.category_id
        LEFT JOIN suppliers s ON s.id = a.supplier_id
        WHERE a.shop_id = ?
      `;
      const params: any[] = [req.user.shopId];

      if (categoryId) {
        sql += ' AND a.category_id = ?';
        params.push(categoryId);
      }

      if (supplierId) {
        sql += ' AND a.supplier_id = ?';
        params.push(supplierId);
      }

      if (status) {
        sql += ' AND a.status = ?';
        params.push(status);
      }

      if (lowStockOnly === 'true') {
        sql += ' AND a.available_quantity <= a.min_stock_threshold';
      }

      if (search) {
        const wild = `%${search.trim().toLowerCase()}%`;
        sql += ' AND (LOWER(a.name) LIKE ? OR LOWER(a.sku) LIKE ? OR LOWER(a.brand) LIKE ? OR LOWER(COALESCE(a.barcode, "")) LIKE ?)';
        params.push(wild, wild, wild, wild);
      }

      sql += ' ORDER BY a.name ASC';

      const accessories = queryAll(sql, params);

      res.status(200).json({
        success: true,
        data: accessories,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAccessory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;

      const accessory = queryOne(
        `SELECT a.*, c.name as category_name, s.name as supplier_name,
          CASE WHEN a.available_quantity <= a.min_stock_threshold THEN 1 ELSE 0 END as is_low_stock
         FROM accessories a
         JOIN accessory_categories c ON c.id = a.category_id
         LEFT JOIN suppliers s ON s.id = a.supplier_id
         WHERE a.id = ? AND a.shop_id = ?`,
        [id, req.user.shopId]
      );

      if (!accessory) {
        throw new AppError(404, 'ACCESSORY_NOT_FOUND', 'Accessory not found.');
      }

      // Remaining FIFO batches
      const batches = queryAll(
        `SELECT b.*, p.reference_no as purchase_reference
         FROM accessory_batches b
         LEFT JOIN purchases p ON p.id = b.purchase_id
         WHERE b.accessory_id = ? AND b.shop_id = ? AND b.remaining_quantity > 0
         ORDER BY b.purchase_date ASC, b.created_at ASC`,
        [id, req.user.shopId]
      );

      // Movements audit
      const movements = queryAll(
        `SELECT m.*, u.name as performed_by_name
         FROM stock_movements m
         JOIN users u ON u.id = m.performed_by
         WHERE m.product_id = ? AND m.shop_id = ?
         ORDER BY m.created_at DESC LIMIT 20`,
        [id, req.user.shopId]
      );

      res.status(200).json({
        success: true,
        data: {
          ...accessory,
          batches,
          movements,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async createAccessory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const data = createAccessorySchema.parse(req.body);

      // Verify unique SKU within shop
      const existingSku = queryOne<{ id: string }>(
        'SELECT id FROM accessories WHERE shop_id = ? AND sku = ?',
        [req.user.shopId, data.sku]
      );

      if (existingSku) {
        throw new AppError(409, 'DUPLICATE_SKU', `An accessory with SKU "${data.sku}" already exists in your shop.`);
      }

      // Check category exists
      const cat = queryOne<{ id: string }>(
        'SELECT id FROM accessory_categories WHERE id = ? AND shop_id = ?',
        [data.categoryId, req.user.shopId]
      );
      if (!cat) {
        throw new AppError(400, 'INVALID_CATEGORY', 'Selected category does not exist.');
      }

      const accId = 'acc_' + crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);

      withTransaction((db) => {
        execute(
          `INSERT INTO accessories (
            id, shop_id, category_id, supplier_id, name, brand, model, sku, barcode,
            purchase_cost, selling_price, available_quantity, min_stock_threshold, description,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
          [
            accId,
            req.user!.shopId,
            data.categoryId,
            data.supplierId || null,
            data.name,
            data.brand,
            data.model || null,
            data.sku,
            data.barcode || null,
            data.purchaseCost,
            data.sellingPrice,
            data.initialQuantity,
            data.minStockThreshold,
            data.description || null,
            nowIso,
            nowIso,
          ],
          db
        );

        // If initial quantity > 0, create initial FIFO batch and movement
        if (data.initialQuantity > 0) {
          execute(
            `INSERT INTO accessory_batches (
              id, shop_id, accessory_id, purchase_id, batch_no, unit_cost,
              initial_quantity, remaining_quantity, purchase_date, created_at
            ) VALUES (?, ?, ?, NULL, 'INIT-BATCH', ?, ?, ?, ?, ?)`,
            [
              'batch_' + crypto.randomUUID(),
              req.user!.shopId,
              accId,
              data.purchaseCost,
              data.initialQuantity,
              data.initialQuantity,
              today,
              nowIso,
            ],
            db
          );

          execute(
            `INSERT INTO stock_movements (
              id, shop_id, item_type, product_id, product_name, identifier, movement_type,
              reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
            ) VALUES (?, ?, 'ACCESSORY', ?, ?, ?, 'INITIAL', NULL, ?, ?, 'Initial accessory stock registration', ?, ?)`,
            [
              'mov_' + crypto.randomUUID(),
              req.user!.shopId,
              accId,
              data.name,
              data.sku,
              data.initialQuantity,
              data.purchaseCost,
              req.user!.id,
              nowIso,
            ],
            db
          );
        }

        // Low stock alert trigger
        if (data.initialQuantity <= data.minStockThreshold) {
          execute(
            `INSERT INTO low_stock_alerts (id, shop_id, accessory_id, threshold, current_quantity, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
            [
              'alert_' + crypto.randomUUID(),
              req.user!.shopId,
              accId,
              data.minStockThreshold,
              data.initialQuantity,
              nowIso,
            ],
            db
          );
        }
      });

      const created = queryOne('SELECT * FROM accessories WHERE id = ?', [accId]);

      res.status(201).json({
        success: true,
        message: `Accessory "${data.name}" added to inventory.`,
        data: created,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateAccessory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;
      const data = updateAccessorySchema.parse(req.body);

      const existing = queryOne<{ id: string; available_quantity: number; min_stock_threshold: number }>(
        'SELECT id, available_quantity, min_stock_threshold FROM accessories WHERE id = ? AND shop_id = ?',
        [id, req.user.shopId]
      );

      if (!existing) {
        throw new AppError(404, 'ACCESSORY_NOT_FOUND', 'Accessory not found.');
      }

      const nowIso = new Date().toISOString();
      const newThreshold = data.minStockThreshold ?? existing.min_stock_threshold;

      withTransaction((db) => {
        execute(
          `UPDATE accessories SET
            name = COALESCE(?, name),
            category_id = COALESCE(?, category_id),
            brand = COALESCE(?, brand),
            model = COALESCE(?, model),
            barcode = COALESCE(?, barcode),
            selling_price = COALESCE(?, selling_price),
            min_stock_threshold = COALESCE(?, min_stock_threshold),
            description = COALESCE(?, description),
            status = COALESCE(?, status),
            updated_at = ?
           WHERE id = ? AND shop_id = ?`,
          [
            data.name ?? null,
            data.categoryId ?? null,
            data.brand ?? null,
            data.model ?? null,
            data.barcode ?? null,
            data.sellingPrice ?? null,
            data.minStockThreshold ?? null,
            data.description ?? null,
            data.status ?? null,
            nowIso,
            id,
            req.user!.shopId,
          ],
          db
        );

        // Re-evaluate low stock alert if threshold updated
        if (existing.available_quantity <= newThreshold) {
          const activeAlert = queryOne<{ id: string }>(
            `SELECT id FROM low_stock_alerts WHERE accessory_id = ? AND shop_id = ? AND status = 'ACTIVE'`,
            [id, req.user!.shopId],
            db
          );
          if (!activeAlert) {
            execute(
              `INSERT INTO low_stock_alerts (id, shop_id, accessory_id, threshold, current_quantity, status, created_at)
               VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
              ['alert_' + crypto.randomUUID(), req.user!.shopId, id, newThreshold, existing.available_quantity, nowIso],
              db
            );
          }
        } else {
          // If stock > threshold, resolve alert
          execute(
            `UPDATE low_stock_alerts SET status = 'RESOLVED', resolved_at = ?
             WHERE accessory_id = ? AND shop_id = ? AND status = 'ACTIVE'`,
            [nowIso, id, req.user!.shopId],
            db
          );
        }
      });

      const updated = queryOne('SELECT * FROM accessories WHERE id = ?', [id]);

      res.status(200).json({
        success: true,
        message: 'Accessory updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;

      const movements = queryAll(
        `SELECT m.*, u.name as performed_by_name
         FROM stock_movements m
         JOIN users u ON u.id = m.performed_by
         WHERE m.product_id = ? AND m.shop_id = ?
         ORDER BY m.created_at DESC`,
        [id, req.user.shopId]
      );

      res.status(200).json({
        success: true,
        data: movements,
      });
    } catch (err) {
      next(err);
    }
  }
}
