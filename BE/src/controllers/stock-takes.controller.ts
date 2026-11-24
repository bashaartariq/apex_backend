import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { queryAll, queryOne, execute, withTransaction } from '../database/query';
import { AppError } from '../middleware/errorHandler';

export const createStockTakeSchema = z.object({
  title: z.string().trim().min(3, 'Session title is required'),
  notes: z.string().trim().optional(),
  scope: z.enum(['ALL', 'PHONES_ONLY', 'ACCESSORIES_ONLY']).default('ALL'),
});

export const updateCountsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      countedQuantity: z.coerce.number().int().min(0),
      discrepancyReason: z.string().trim().optional(),
      verified: z.boolean().optional(),
    })
  ).min(1, 'At least one item count must be provided'),
});

export class StockTakesController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const shopId = req.user.shopId;

      const sessions = queryAll(
        `SELECT
          st.*,
          u1.name as started_by_name,
          u2.name as finalized_by_name,
          (SELECT COUNT(*) FROM stock_take_items WHERE stock_take_id = st.id) as total_items,
          (SELECT COUNT(*) FROM stock_take_items WHERE stock_take_id = st.id AND discrepancy != 0) as discrepancy_count
        FROM stock_takes st
        JOIN users u1 ON u1.id = st.started_by
        LEFT JOIN users u2 ON u2.id = st.finalized_by
        WHERE st.shop_id = ?
        ORDER BY st.started_at DESC`,
        [shopId]
      );

      res.status(200).json({
        success: true,
        data: sessions,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;
      const shopId = req.user.shopId;

      const session = queryOne(
        `SELECT
          st.*,
          u1.name as started_by_name,
          u2.name as finalized_by_name
        FROM stock_takes st
        JOIN users u1 ON u1.id = st.started_by
        LEFT JOIN users u2 ON u2.id = st.finalized_by
        WHERE st.id = ? AND st.shop_id = ?`,
        [id, shopId]
      );

      if (!session) {
        throw new AppError(404, 'SESSION_NOT_FOUND', 'Stock take session not found.');
      }

      const items = queryAll(
        `SELECT * FROM stock_take_items
         WHERE stock_take_id = ? AND shop_id = ?
         ORDER BY item_type ASC, product_name ASC`,
        [id, shopId]
      );

      res.status(200).json({
        success: true,
        data: {
          ...session,
          items,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const data = createStockTakeSchema.parse(req.body);
      const shopId = req.user.shopId;
      const nowIso = new Date().toISOString();
      const sessionId = 'st_' + crypto.randomUUID();

      // Generate session code
      const countRow = queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM stock_takes WHERE shop_id = ?',
        [shopId]
      );
      const count = (countRow?.count || 0) + 1;
      const sessionCode = `ST-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

      withTransaction((db) => {
        execute(
          `INSERT INTO stock_takes (
            id, shop_id, session_code, title, status, started_by, started_at, notes
          ) VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)`,
          [sessionId, shopId, sessionCode, data.title, req.user!.id, nowIso, data.notes || null],
          db
        );

        // Populate items based on scope
        if (data.scope === 'ALL' || data.scope === 'PHONES_ONLY') {
          const phones = queryAll<{ id: string; brand: string; model: string; imei1: string }>(
            `SELECT id, brand, model, imei1 FROM phone_inventory WHERE shop_id = ? AND status = 'IN_STOCK'`,
            [shopId],
            db
          );

          for (const p of phones) {
            execute(
              `INSERT INTO stock_take_items (
                id, stock_take_id, shop_id, item_type, product_id, product_name,
                identifier, expected_quantity, counted_quantity, discrepancy, discrepancy_reason, verified, created_at, updated_at
              ) VALUES (?, ?, ?, 'PHONE', ?, ?, ?, 1, 1, 0, NULL, 0, ?, ?)`,
              [
                'sti_' + crypto.randomUUID(),
                sessionId,
                shopId,
                p.id,
                `${p.brand} ${p.model}`,
                p.imei1,
                nowIso,
                nowIso,
              ],
              db
            );
          }
        }

        if (data.scope === 'ALL' || data.scope === 'ACCESSORIES_ONLY') {
          const accessories = queryAll<{ id: string; name: string; sku: string; available_quantity: number }>(
            `SELECT id, name, sku, available_quantity FROM accessories WHERE shop_id = ? AND status = 'ACTIVE'`,
            [shopId],
            db
          );

          for (const a of accessories) {
            execute(
              `INSERT INTO stock_take_items (
                id, stock_take_id, shop_id, item_type, product_id, product_name,
                identifier, expected_quantity, counted_quantity, discrepancy, discrepancy_reason, verified, created_at, updated_at
              ) VALUES (?, ?, ?, 'ACCESSORY', ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?)`,
              [
                'sti_' + crypto.randomUUID(),
                sessionId,
                shopId,
                a.id,
                a.name,
                a.sku,
                a.available_quantity,
                a.available_quantity,
                nowIso,
                nowIso,
              ],
              db
            );
          }
        }
      });

      res.status(201).json({
        success: true,
        message: 'Stock-taking session initiated successfully.',
        data: {
          id: sessionId,
          sessionCode,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateCounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;
      const { items } = updateCountsSchema.parse(req.body);
      const shopId = req.user.shopId;
      const nowIso = new Date().toISOString();

      const session = queryOne<{ id: string; status: string }>(
        'SELECT id, status FROM stock_takes WHERE id = ? AND shop_id = ?',
        [id, shopId]
      );

      if (!session) {
        throw new AppError(404, 'SESSION_NOT_FOUND', 'Stock take session not found.');
      }

      if (session.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'SESSION_LOCKED', `Cannot update counts for session with status "${session.status}".`);
      }

      withTransaction((db) => {
        for (const item of items) {
          const currentItem = queryOne<{ id: string; expected_quantity: number }>(
            'SELECT id, expected_quantity FROM stock_take_items WHERE id = ? AND stock_take_id = ? AND shop_id = ?',
            [item.id, id, shopId],
            db
          );

          if (currentItem) {
            const discrepancy = item.countedQuantity - currentItem.expected_quantity;
            execute(
              `UPDATE stock_take_items
               SET counted_quantity = ?, discrepancy = ?, discrepancy_reason = COALESCE(?, discrepancy_reason),
                   verified = COALESCE(?, verified), updated_at = ?
               WHERE id = ?`,
              [
                item.countedQuantity,
                discrepancy,
                item.discrepancyReason || null,
                item.verified !== undefined ? (item.verified ? 1 : 0) : null,
                nowIso,
                item.id,
              ],
              db
            );
          }
        }
      });

      res.status(200).json({
        success: true,
        message: 'Stock counts saved.',
      });
    } catch (err) {
      next(err);
    }
  }

  static async finalize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;
      const shopId = req.user.shopId;
      const nowIso = new Date().toISOString();

      const session = queryOne<{ id: string; session_code: string; status: string }>(
        'SELECT id, session_code, status FROM stock_takes WHERE id = ? AND shop_id = ?',
        [id, shopId]
      );

      if (!session) {
        throw new AppError(404, 'SESSION_NOT_FOUND', 'Stock take session not found.');
      }

      if (session.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'SESSION_LOCKED', `Cannot finalize a session in "${session.status}" status.`);
      }

      withTransaction((db) => {
        // Fetch items with discrepancies
        const items = queryAll<{
          id: string;
          item_type: string;
          product_id: string;
          product_name: string;
          identifier: string | null;
          expected_quantity: number;
          counted_quantity: number;
          discrepancy: number;
          discrepancy_reason: string | null;
        }>(
          'SELECT * FROM stock_take_items WHERE stock_take_id = ? AND discrepancy != 0',
          [id],
          db
        );

        for (const item of items) {
          const adjId = 'adj_' + crypto.randomUUID();
          const reason = item.discrepancy_reason || `Stock-take discrepancy adjustment [${session.session_code}]`;

          if (item.item_type === 'ACCESSORY') {
            const acc = queryOne<{ id: string; purchase_cost: number; min_stock_threshold: number }>(
              'SELECT id, purchase_cost, min_stock_threshold FROM accessories WHERE id = ? AND shop_id = ?',
              [item.product_id, shopId],
              db
            );

            if (acc) {
              execute(
                'UPDATE accessories SET available_quantity = ?, updated_at = ? WHERE id = ?',
                [item.counted_quantity, nowIso, acc.id],
                db
              );

              if (item.discrepancy > 0) {
                // Surplus: add adjustment batch
                execute(
                  `INSERT INTO accessory_batches (
                    id, shop_id, accessory_id, purchase_id, batch_no, unit_cost,
                    initial_quantity, remaining_quantity, purchase_date, created_at
                  ) VALUES (?, ?, ?, NULL, 'ST-SURPLUS', ?, ?, ?, ?, ?)`,
                  [
                    'batch_' + crypto.randomUUID(),
                    shopId,
                    acc.id,
                    acc.purchase_cost,
                    item.discrepancy,
                    item.discrepancy,
                    nowIso.slice(0, 10),
                    nowIso,
                  ],
                  db
                );
              } else {
                // Deficit: deduct from oldest batches
                let toDeduct = Math.abs(item.discrepancy);
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

              // Record adjustment & movement
              execute(
                `INSERT INTO stock_adjustments (
                  id, shop_id, item_type, product_id, product_name, previous_quantity,
                  new_quantity, quantity_delta, previous_status, new_status, reason, performed_by, created_at
                ) VALUES (?, ?, 'ACCESSORY', ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
                [
                  adjId,
                  shopId,
                  acc.id,
                  item.product_name,
                  item.expected_quantity,
                  item.counted_quantity,
                  item.discrepancy,
                  reason,
                  req.user!.id,
                  nowIso,
                ],
                db
              );

              execute(
                `INSERT INTO stock_movements (
                  id, shop_id, item_type, product_id, product_name, identifier, movement_type,
                  reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
                ) VALUES (?, ?, 'ACCESSORY', ?, ?, ?, 'STOCK_TAKE', ?, ?, ?, ?, ?, ?)`,
                [
                  'mov_' + crypto.randomUUID(),
                  shopId,
                  acc.id,
                  item.product_name,
                  item.identifier,
                  session.id,
                  item.discrepancy,
                  acc.purchase_cost,
                  reason,
                  req.user!.id,
                  nowIso,
                ],
                db
              );

              // Low-stock alert check
              if (item.counted_quantity <= acc.min_stock_threshold) {
                const activeAlert = queryOne<{ id: string }>(
                  `SELECT id FROM low_stock_alerts WHERE accessory_id = ? AND shop_id = ? AND status = 'ACTIVE'`,
                  [acc.id, shopId],
                  db
                );
                if (!activeAlert) {
                  execute(
                    `INSERT INTO low_stock_alerts (id, shop_id, accessory_id, threshold, current_quantity, status, created_at)
                     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
                    ['alert_' + crypto.randomUUID(), shopId, acc.id, acc.min_stock_threshold, item.counted_quantity, nowIso],
                    db
                  );
                }
              }
            }
          } else if (item.item_type === 'PHONE') {
            const phone = queryOne<{ id: string; purchase_cost: number; status: string }>(
              'SELECT id, purchase_cost, status FROM phone_inventory WHERE id = ? AND shop_id = ?',
              [item.product_id, shopId],
              db
            );

            if (phone) {
              const newPhoneStatus = item.counted_quantity === 0 ? 'RESERVED' : 'IN_STOCK';
              execute(
                'UPDATE phone_inventory SET status = ?, updated_at = ? WHERE id = ?',
                [newPhoneStatus, nowIso, phone.id],
                db
              );

              execute(
                `INSERT INTO stock_adjustments (
                  id, shop_id, item_type, product_id, product_name, previous_quantity,
                  new_quantity, quantity_delta, previous_status, new_status, reason, performed_by, created_at
                ) VALUES (?, ?, 'PHONE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  adjId,
                  shopId,
                  phone.id,
                  item.product_name,
                  item.expected_quantity,
                  item.counted_quantity,
                  item.discrepancy,
                  phone.status,
                  newPhoneStatus,
                  reason,
                  req.user!.id,
                  nowIso,
                ],
                db
              );

              execute(
                `INSERT INTO stock_movements (
                  id, shop_id, item_type, product_id, product_name, identifier, movement_type,
                  reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
                ) VALUES (?, ?, 'PHONE', ?, ?, ?, 'STOCK_TAKE', ?, ?, ?, ?, ?, ?)`,
                [
                  'mov_' + crypto.randomUUID(),
                  shopId,
                  phone.id,
                  item.product_name,
                  item.identifier,
                  session.id,
                  item.discrepancy,
                  phone.purchase_cost,
                  reason,
                  req.user!.id,
                  nowIso,
                ],
                db
              );
            }
          }
        }

        // Finalize session
        execute(
          `UPDATE stock_takes
           SET status = 'FINALIZED', finalized_by = ?, finalized_at = ?
           WHERE id = ? AND shop_id = ?`,
          [req.user!.id, nowIso, id, shopId],
          db
        );
      });

      res.status(200).json({
        success: true,
        message: 'Stock-taking session finalized. Stock adjustments recorded.',
      });
    } catch (err) {
      next(err);
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;
      const shopId = req.user.shopId;

      const session = queryOne<{ id: string; status: string }>(
        'SELECT id, status FROM stock_takes WHERE id = ? AND shop_id = ?',
        [id, shopId]
      );

      if (!session) {
        throw new AppError(404, 'SESSION_NOT_FOUND', 'Stock take session not found.');
      }

      if (session.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'SESSION_LOCKED', `Cannot cancel a session in "${session.status}" status.`);
      }

      execute(
        `UPDATE stock_takes SET status = 'CANCELLED' WHERE id = ? AND shop_id = ?`,
        [id, shopId]
      );

      res.status(200).json({
        success: true,
        message: 'Stock-taking session cancelled.',
      });
    } catch (err) {
      next(err);
    }
  }
}
