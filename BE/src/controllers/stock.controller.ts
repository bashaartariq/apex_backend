import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { queryAll, queryOne, execute, withTransaction } from '../database/query';
import { AppError } from '../middleware/errorHandler';

export const createAdjustmentSchema = z.object({
  itemType: z.enum(['PHONE', 'ACCESSORY']),
  productId: z.string().min(1, 'Please select a product.'),
  // For accessories: target new quantity
  newQuantity: z.coerce.number().int('Quantity must be a whole number.').min(0, 'Quantity cannot be negative.').optional(),
  // For phones: target new status
  newStatus: z.enum(['IN_STOCK', 'SOLD', 'RETURNED', 'RESERVED', 'UNDER_REPAIR']).optional(),
  reason: z.string().trim().min(3, 'Please provide a clear reason for the manual stock adjustment.'),
});

export class StockController {
  static async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const shopId = req.user.shopId;

      // 1. Phone metrics
      const phoneStats = queryOne<{
        total_in_stock: number;
        new_count: number;
        used_count: number;
        phones_valuation: number;
      }>(
        `SELECT
          COUNT(*) as total_in_stock,
          COALESCE(SUM(CASE WHEN condition = 'NEW' THEN 1 ELSE 0 END), 0) as new_count,
          COALESCE(SUM(CASE WHEN condition = 'USED' THEN 1 ELSE 0 END), 0) as used_count,
          COALESCE(SUM(purchase_cost), 0.0) as phones_valuation
        FROM phone_inventory
        WHERE shop_id = ? AND status = 'IN_STOCK'`,
        [shopId]
      );

      // 2. Accessories FIFO Valuation & Stock counts
      const accStats = queryOne<{
        total_quantity: number;
        total_products: number;
        low_stock_count: number;
      }>(
        `SELECT
          COALESCE(SUM(available_quantity), 0) as total_quantity,
          COUNT(*) as total_products,
          COALESCE(SUM(CASE WHEN available_quantity <= min_stock_threshold THEN 1 ELSE 0 END), 0) as low_stock_count
        FROM accessories
        WHERE shop_id = ? AND status = 'ACTIVE'`,
        [shopId]
      );

      // Strict FIFO Batch Valuation for Accessories
      const fifoValuationRow = queryOne<{ valuation: number }>(
        `SELECT COALESCE(SUM(remaining_quantity * unit_cost), 0.0) as valuation
         FROM accessory_batches
         WHERE shop_id = ? AND remaining_quantity > 0`,
        [shopId]
      );

      const phonesValuation = phoneStats?.phones_valuation || 0;
      const accessoriesValuation = fifoValuationRow?.valuation || 0;
      const totalInventoryValuation = phonesValuation + accessoriesValuation;

      // Recent items
      const recentPhones = queryAll(
        `SELECT id, brand, model, imei1, condition, purchase_cost, selling_price, status, created_at
         FROM phone_inventory
         WHERE shop_id = ?
         ORDER BY created_at DESC LIMIT 5`,
        [shopId]
      );

      const recentAccessories = queryAll(
        `SELECT a.id, a.name, a.brand, a.sku, a.available_quantity, a.selling_price, c.name as category_name
         FROM accessories a
         JOIN accessory_categories c ON c.id = a.category_id
         WHERE a.shop_id = ?
         ORDER BY a.created_at DESC LIMIT 5`,
        [shopId]
      );

      const recentPurchases = queryAll(
        `SELECT p.id, p.reference_no, p.purchase_date, p.status, p.total_amount, s.name as supplier_name
         FROM purchases p
         JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.shop_id = ?
         ORDER BY p.purchase_date DESC, p.created_at DESC LIMIT 5`,
        [shopId]
      );

      const activeAlerts = queryAll(
        `SELECT l.*, a.name as accessory_name, a.sku as accessory_sku, a.brand, c.name as category_name
         FROM low_stock_alerts l
         JOIN accessories a ON a.id = l.accessory_id
         JOIN accessory_categories c ON c.id = a.category_id
         WHERE l.shop_id = ? AND l.status = 'ACTIVE'
         ORDER BY (l.threshold - l.current_quantity) DESC LIMIT 10`,
        [shopId]
      );

      res.status(200).json({
        success: true,
        data: {
          phones: {
            totalInStock: phoneStats?.total_in_stock || 0,
            newCount: phoneStats?.new_count || 0,
            usedCount: phoneStats?.used_count || 0,
            valuation: phonesValuation,
          },
          accessories: {
            totalQuantity: accStats?.total_quantity || 0,
            totalProducts: accStats?.total_products || 0,
            lowStockCount: accStats?.low_stock_count || 0,
            valuation: accessoriesValuation,
          },
          totalInventoryValuation,
          activeAlerts,
          recentPhones,
          recentAccessories,
          recentPurchases,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async adjustStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const data = createAdjustmentSchema.parse(req.body);
      const shopId = req.user.shopId;
      const nowIso = new Date().toISOString();
      const adjId = 'adj_' + crypto.randomUUID();

      withTransaction((db) => {
        if (data.itemType === 'ACCESSORY') {
          if (data.newQuantity === undefined) {
            throw new AppError(400, 'QUANTITY_REQUIRED', 'newQuantity is required for accessory stock adjustment.');
          }

          const acc = queryOne<{
            id: string;
            name: string;
            sku: string;
            purchase_cost: number;
            available_quantity: number;
            min_stock_threshold: number;
          }>(
            'SELECT id, name, sku, purchase_cost, available_quantity, min_stock_threshold FROM accessories WHERE id = ? AND shop_id = ?',
            [data.productId, shopId],
            db
          );

          if (!acc) {
            throw new AppError(404, 'ACCESSORY_NOT_FOUND', 'Accessory not found.');
          }

          const delta = data.newQuantity - acc.available_quantity;
          if (delta === 0) {
            throw new AppError(400, 'NO_CHANGE', 'New quantity matches current stock.');
          }

          // Update accessory quantity
          execute(
            `UPDATE accessories SET available_quantity = ?, updated_at = ? WHERE id = ? AND shop_id = ?`,
            [data.newQuantity, nowIso, acc.id, shopId],
            db
          );

          // Update FIFO batches:
          if (delta > 0) {
            // Increasing stock: add an adjustment batch
            execute(
              `INSERT INTO accessory_batches (
                id, shop_id, accessory_id, purchase_id, batch_no, unit_cost,
                initial_quantity, remaining_quantity, purchase_date, created_at
              ) VALUES (?, ?, ?, NULL, 'ADJ-BATCH', ?, ?, ?, ?, ?)`,
              [
                'batch_' + crypto.randomUUID(),
                shopId,
                acc.id,
                acc.purchase_cost,
                delta,
                delta,
                nowIso.slice(0, 10),
                nowIso,
              ],
              db
            );
          } else {
            // Decreasing stock: consume from oldest remaining FIFO batches
            let toDeduct = Math.abs(delta);
            const openBatches = queryAll<{ id: string; remaining_quantity: number }>(
              `SELECT id, remaining_quantity FROM accessory_batches
               WHERE accessory_id = ? AND remaining_quantity > 0
               ORDER BY purchase_date ASC, created_at ASC`,
              [acc.id],
              db
            );

            for (const b of openBatches) {
              if (toDeduct <= 0) break;
              const deductFromThis = Math.min(b.remaining_quantity, toDeduct);
              execute(
                `UPDATE accessory_batches SET remaining_quantity = remaining_quantity - ? WHERE id = ?`,
                [deductFromThis, b.id],
                db
              );
              toDeduct -= deductFromThis;
            }
          }

          // Record adjustment log
          execute(
            `INSERT INTO stock_adjustments (
              id, shop_id, item_type, product_id, product_name, previous_quantity,
              new_quantity, quantity_delta, previous_status, new_status, reason, performed_by, created_at
            ) VALUES (?, ?, 'ACCESSORY', ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
            [
              adjId,
              shopId,
              acc.id,
              acc.name,
              acc.available_quantity,
              data.newQuantity,
              delta,
              data.reason,
              req.user!.id,
              nowIso,
            ],
            db
          );

          // Record stock movement
          execute(
            `INSERT INTO stock_movements (
              id, shop_id, item_type, product_id, product_name, identifier, movement_type,
              reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
            ) VALUES (?, ?, 'ACCESSORY', ?, ?, ?, 'ADJUSTMENT', ?, ?, ?, ?, ?, ?)`,
            [
              'mov_' + crypto.randomUUID(),
              shopId,
              acc.id,
              acc.name,
              acc.sku,
              adjId,
              delta,
              acc.purchase_cost,
              data.reason,
              req.user!.id,
              nowIso,
            ],
            db
          );

          // Low-stock alert trigger or resolve
          if (data.newQuantity <= acc.min_stock_threshold) {
            const activeAlert = queryOne<{ id: string }>(
              `SELECT id FROM low_stock_alerts WHERE accessory_id = ? AND shop_id = ? AND status = 'ACTIVE'`,
              [acc.id, shopId],
              db
            );
            if (!activeAlert) {
              execute(
                `INSERT INTO low_stock_alerts (id, shop_id, accessory_id, threshold, current_quantity, status, created_at)
                 VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
                ['alert_' + crypto.randomUUID(), shopId, acc.id, acc.min_stock_threshold, data.newQuantity, nowIso],
                db
              );
            }
          } else {
            execute(
              `UPDATE low_stock_alerts SET status = 'RESOLVED', resolved_at = ?
               WHERE accessory_id = ? AND shop_id = ? AND status = 'ACTIVE'`,
              [nowIso, acc.id, shopId],
              db
            );
          }
        } else if (data.itemType === 'PHONE') {
          if (!data.newStatus) {
            throw new AppError(400, 'STATUS_REQUIRED', 'newStatus is required for phone status adjustment.');
          }

          const phone = queryOne<{
            id: string;
            brand: string;
            model: string;
            imei1: string;
            purchase_cost: number;
            status: string;
          }>(
            'SELECT id, brand, model, imei1, purchase_cost, status FROM phone_inventory WHERE id = ? AND shop_id = ?',
            [data.productId, shopId],
            db
          );

          if (!phone) {
            throw new AppError(404, 'PHONE_NOT_FOUND', 'Phone not found.');
          }

          if (phone.status === data.newStatus) {
            throw new AppError(400, 'NO_CHANGE', `Phone is already in status "${data.newStatus}".`);
          }

          execute(
            `UPDATE phone_inventory SET status = ?, updated_at = ? WHERE id = ? AND shop_id = ?`,
            [data.newStatus, nowIso, phone.id, shopId],
            db
          );

          execute(
            `INSERT INTO stock_adjustments (
              id, shop_id, item_type, product_id, product_name, previous_quantity,
              new_quantity, quantity_delta, previous_status, new_status, reason, performed_by, created_at
            ) VALUES (?, ?, 'PHONE', ?, ?, 1, 1, 0, ?, ?, ?, ?, ?)`,
            [
              adjId,
              shopId,
              phone.id,
              `${phone.brand} ${phone.model}`,
              phone.status,
              data.newStatus,
              data.reason,
              req.user!.id,
              nowIso,
            ],
            db
          );

          execute(
            `INSERT INTO stock_movements (
              id, shop_id, item_type, product_id, product_name, identifier, movement_type,
              reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
            ) VALUES (?, ?, 'PHONE', ?, ?, ?, 'ADJUSTMENT', ?, 0, ?, ?, ?, ?)`,
            [
              'mov_' + crypto.randomUUID(),
              shopId,
              phone.id,
              `${phone.brand} ${phone.model}`,
              phone.imei1,
              adjId,
              phone.purchase_cost,
              data.reason,
              req.user!.id,
              nowIso,
            ],
            db
          );
        }
      });

      res.status(200).json({
        success: true,
        message: 'Manual stock adjustment recorded.',
        adjustmentId: adjId,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');

      const { itemType, movementType, search } = req.query as Record<string, string>;

      let sql = `
        SELECT m.*, u.name as performed_by_name
        FROM stock_movements m
        JOIN users u ON u.id = m.performed_by
        WHERE m.shop_id = ?
      `;
      const params: any[] = [req.user.shopId];

      if (itemType) {
        sql += ' AND m.item_type = ?';
        params.push(itemType);
      }

      if (movementType) {
        sql += ' AND m.movement_type = ?';
        params.push(movementType);
      }

      if (search) {
        const wild = `%${search.trim().toLowerCase()}%`;
        sql += ' AND (LOWER(m.product_name) LIKE ? OR LOWER(COALESCE(m.identifier, "")) LIKE ? OR LOWER(m.reason) LIKE ?)';
        params.push(wild, wild, wild);
      }

      sql += ' ORDER BY m.created_at DESC LIMIT 100';

      const movements = queryAll(sql, params);

      res.status(200).json({
        success: true,
        data: movements,
      });
    } catch (err) {
      next(err);
    }
  }

  static async listLowStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');

      const lowStock = queryAll(
        `SELECT
          a.id, a.name, a.brand, a.sku, a.barcode, a.available_quantity,
          a.min_stock_threshold, a.purchase_cost, a.selling_price,
          c.name as category_name, s.name as supplier_name,
          (a.min_stock_threshold - a.available_quantity) as deficit
         FROM accessories a
         JOIN accessory_categories c ON c.id = a.category_id
         LEFT JOIN suppliers s ON s.id = a.supplier_id
         WHERE a.shop_id = ? AND a.status = 'ACTIVE' AND a.available_quantity <= a.min_stock_threshold
         ORDER BY (a.min_stock_threshold - a.available_quantity) DESC, a.available_quantity ASC`,
        [req.user.shopId]
      );

      res.status(200).json({
        success: true,
        data: lowStock,
      });
    } catch (err) {
      next(err);
    }
  }
}
