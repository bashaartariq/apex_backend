import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { queryAll, queryOne, execute, withTransaction } from '../database/query';
import { AppError } from '../middleware/errorHandler';

export const createPhoneSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const rawCost = val.purchaseCost !== undefined ? val.purchaseCost : val.purchase_cost;
    const rawPrice = val.sellingPrice !== undefined ? val.sellingPrice : val.selling_price;
    const rawSup = val.supplierId !== undefined ? val.supplierId : val.supplier_id;
    const rawBattery = val.batteryHealth !== undefined ? val.batteryHealth : val.battery_health;
    const rawCond = val.physicalCondition !== undefined ? val.physicalCondition : val.physical_condition;
    const rawAcc = val.accessoriesIncluded !== undefined ? val.accessoriesIncluded : val.accessories_included;
    const rawDate = val.purchaseDate !== undefined ? val.purchaseDate : val.purchase_date;

    return {
      ...val,
      purchaseCost: rawCost !== undefined && rawCost !== null && rawCost !== '' ? Number(rawCost) : undefined,
      sellingPrice: rawPrice !== undefined && rawPrice !== null && rawPrice !== '' ? Number(rawPrice) : undefined,
      supplierId: rawSup && String(rawSup).trim() !== '' ? String(rawSup).trim() : null,
      batteryHealth: rawBattery !== undefined && rawBattery !== null && rawBattery !== '' ? Number(rawBattery) : null,
      physicalCondition: rawCond !== undefined ? rawCond : null,
      accessoriesIncluded: rawAcc !== undefined ? rawAcc : null,
      purchaseDate: rawDate !== undefined ? rawDate : undefined,
    };
  }
  return val;
}, z.object({
  brand: z.string().trim().min(1, 'Please enter a brand name.'),
  model: z.string().trim().min(1, 'Please enter a phone model.'),
  imei1: z.string().trim().min(8, 'Please enter a valid IMEI number (at least 8 characters).'),
  imei2: z.string().trim().optional().nullable().or(z.literal('')),
  ram: z.string().trim().optional().nullable(),
  storage: z.string().trim().optional().nullable(),
  color: z.string().trim().optional().nullable(),
  condition: z.enum(['NEW', 'USED']).default('NEW'),
  purchaseCost: z.coerce.number().min(0, 'Purchase cost cannot be negative.'),
  sellingPrice: z.coerce.number().min(0, 'Selling price cannot be negative.'),
  supplierId: z.string().optional().nullable().or(z.literal('')),
  batteryHealth: z.coerce.number().min(0, 'Battery health cannot be negative.').max(100, 'Battery health cannot exceed 100%.').optional().nullable(),
  physicalCondition: z.string().trim().optional().nullable(),
  accessoriesIncluded: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  purchaseDate: z.string().optional(),
  status: z.enum(['IN_STOCK', 'SOLD', 'RETURNED', 'RESERVED', 'UNDER_REPAIR']).optional(),
}));

export const updatePhoneSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const rawPrice = val.sellingPrice !== undefined ? val.sellingPrice : val.selling_price;
    const rawBattery = val.batteryHealth !== undefined ? val.batteryHealth : val.battery_health;
    const rawCond = val.physicalCondition !== undefined ? val.physicalCondition : val.physical_condition;
    const rawAcc = val.accessoriesIncluded !== undefined ? val.accessoriesIncluded : val.accessories_included;
    const rawReason = val.statusReason !== undefined ? val.statusReason : val.status_reason;

    return {
      ...val,
      sellingPrice: rawPrice !== undefined && rawPrice !== null && rawPrice !== '' ? Number(rawPrice) : undefined,
      batteryHealth: rawBattery !== undefined && rawBattery !== null && rawBattery !== '' ? Number(rawBattery) : undefined,
      physicalCondition: rawCond !== undefined ? rawCond : undefined,
      accessoriesIncluded: rawAcc !== undefined ? rawAcc : undefined,
      statusReason: rawReason !== undefined ? rawReason : undefined,
    };
  }
  return val;
}, z.object({
  brand: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  batteryHealth: z.coerce.number().min(0).max(100).optional().nullable(),
  physicalCondition: z.string().trim().optional().nullable(),
  accessoriesIncluded: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  status: z.enum(['IN_STOCK', 'SOLD', 'RETURNED', 'RESERVED', 'UNDER_REPAIR']).optional(),
  statusReason: z.string().trim().optional(),
}));

export class PhonesController {
  static async listPhones(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');

      const {
        brand,
        model,
        condition,
        status,
        supplierId,
        search,
      } = req.query as Record<string, string>;

      let sql = `
        SELECT p.*, s.name as supplier_name, pr.reference_no as purchase_reference
        FROM phone_inventory p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN purchases pr ON pr.id = p.purchase_id
        WHERE p.shop_id = ?
      `;
      const params: any[] = [req.user.shopId];

      if (brand) {
        sql += ' AND LOWER(p.brand) = LOWER(?)';
        params.push(brand);
      }

      if (model) {
        sql += ' AND LOWER(p.model) LIKE LOWER(?)';
        params.push(`%${model}%`);
      }

      if (condition) {
        sql += ' AND p.condition = ?';
        params.push(condition);
      }

      if (status) {
        sql += ' AND p.status = ?';
        params.push(status);
      }

      if (supplierId) {
        sql += ' AND p.supplier_id = ?';
        params.push(supplierId);
      }

      if (search) {
        const wild = `%${search.trim().toLowerCase()}%`;
        sql += ' AND (LOWER(p.brand) LIKE ? OR LOWER(p.model) LIKE ? OR LOWER(p.imei1) LIKE ? OR LOWER(COALESCE(p.imei2, "")) LIKE ?)';
        params.push(wild, wild, wild, wild);
      }

      sql += ' ORDER BY p.created_at DESC';

      const phones = queryAll(sql, params);

      res.status(200).json({
        success: true,
        data: phones,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;

      const phone = queryOne(
        `SELECT p.*, s.name as supplier_name, s.phone as supplier_phone, pr.reference_no as purchase_reference
         FROM phone_inventory p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         LEFT JOIN purchases pr ON pr.id = p.purchase_id
         WHERE p.id = ? AND p.shop_id = ?`,
        [id, req.user.shopId]
      );

      if (!phone) {
        throw new AppError(404, 'PHONE_NOT_FOUND', 'Mobile phone record not found.');
      }

      // Audit movements history
      const history = queryAll(
        `SELECT m.*, u.name as performed_by_name
         FROM stock_movements m
         JOIN users u ON u.id = m.performed_by
         WHERE m.product_id = ? AND m.shop_id = ?
         ORDER BY m.created_at DESC`,
        [id, req.user.shopId]
      );

      res.status(200).json({
        success: true,
        data: {
          ...phone,
          history,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async lookupImei(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const imei = (req.params.imei || req.query.imei as string)?.trim();

      if (!imei) {
        throw new AppError(400, 'IMEI_REQUIRED', 'Please provide an IMEI to lookup.');
      }

      const phone = queryOne(
        `SELECT p.*, s.name as supplier_name
         FROM phone_inventory p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.shop_id = ? AND (p.imei1 = ? OR p.imei2 = ?)`,
        [req.user.shopId, imei, imei]
      );

      if (!phone) {
        throw new AppError(404, 'PHONE_NOT_FOUND', `No device found with IMEI "${imei}" in your store.`);
      }

      res.status(200).json({
        success: true,
        data: phone,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const data = createPhoneSchema.parse(req.body);

      // Verify unique IMEI1 within this shop
      const existingImei = queryOne<{ id: string }>(
        'SELECT id FROM phone_inventory WHERE shop_id = ? AND (imei1 = ? OR imei2 = ?)',
        [req.user.shopId, data.imei1, data.imei1]
      );

      if (existingImei) {
        throw new AppError(409, 'DUPLICATE_IMEI', `A mobile phone with IMEI "${data.imei1}" is already registered in your store.`);
      }

      if (data.imei2) {
        const existingImei2 = queryOne<{ id: string }>(
          'SELECT id FROM phone_inventory WHERE shop_id = ? AND (imei1 = ? OR imei2 = ?)',
          [req.user.shopId, data.imei2, data.imei2]
        );
        if (existingImei2) {
          throw new AppError(409, 'DUPLICATE_IMEI', `A mobile phone with IMEI 2 "${data.imei2}" is already registered in your store.`);
        }
      }

      // Check supplier if provided
      if (data.supplierId && data.supplierId.trim() !== '') {
        const supp = queryOne<{ id: string; status: string }>(
          'SELECT id, status FROM suppliers WHERE id = ? AND shop_id = ?',
          [data.supplierId.trim(), req.user.shopId]
        );
        if (!supp || supp.status !== 'ACTIVE') {
          throw new AppError(400, 'INVALID_SUPPLIER', 'Selected supplier is invalid or inactive.');
        }
      }

      const phoneId = 'phone_' + crypto.randomUUID();
      const movementId = 'mov_' + crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const purchaseDate = data.purchaseDate || nowIso.slice(0, 10);
      const phoneStatus = data.status || 'IN_STOCK';

      withTransaction((db) => {
        execute(
          `INSERT INTO phone_inventory (
            id, shop_id, supplier_id, purchase_id, brand, model, imei1, imei2, ram, storage, color,
            condition, purchase_cost, selling_price, battery_health, physical_condition,
            accessories_included, description, status, purchase_date, created_at, updated_at
          ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            phoneId,
            req.user!.shopId,
            (data.supplierId && data.supplierId.trim() !== '') ? data.supplierId.trim() : null,
            data.brand,
            data.model,
            data.imei1,
            data.imei2 || null,
            data.ram || null,
            data.storage || null,
            data.color || null,
            data.condition,
            data.purchaseCost,
            data.sellingPrice,
            data.batteryHealth ?? (data.condition === 'NEW' ? 100 : null),
            data.physicalCondition || null,
            data.accessoriesIncluded || null,
            data.description || null,
            phoneStatus,
            purchaseDate,
            nowIso,
            nowIso,
          ],
          db
        );

        // Record stock movement
        execute(
          `INSERT INTO stock_movements (
            id, shop_id, item_type, product_id, product_name, identifier, movement_type,
            reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
          ) VALUES (?, ?, 'PHONE', ?, ?, ?, 'INITIAL', NULL, 1, ?, 'Direct phone registration', ?, ?)`,
          [
            movementId,
            req.user!.shopId,
            phoneId,
            `${data.brand} ${data.model}`,
            data.imei1,
            data.purchaseCost,
            req.user!.id,
            nowIso,
          ],
          db
        );
      });

      const created = queryOne('SELECT * FROM phone_inventory WHERE id = ?', [phoneId]);

      res.status(201).json({
        success: true,
        message: `Registered ${data.brand} ${data.model} (IMEI: ${data.imei1}) into inventory.`,
        data: created,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updatePhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;
      const data = updatePhoneSchema.parse(req.body);

      const phone = queryOne<{
        id: string;
        brand: string;
        model: string;
        imei1: string;
        status: string;
      }>('SELECT id, brand, model, imei1, status FROM phone_inventory WHERE id = ? AND shop_id = ?', [id, req.user.shopId]);

      if (!phone) {
        throw new AppError(404, 'PHONE_NOT_FOUND', 'Mobile phone not found.');
      }

      const nowIso = new Date().toISOString();

      withTransaction((db) => {
        execute(
          `UPDATE phone_inventory SET
            brand = COALESCE(?, brand),
            model = COALESCE(?, model),
            selling_price = COALESCE(?, selling_price),
            battery_health = COALESCE(?, battery_health),
            physical_condition = COALESCE(?, physical_condition),
            accessories_included = COALESCE(?, accessories_included),
            description = COALESCE(?, description),
            status = COALESCE(?, status),
            updated_at = ?
           WHERE id = ? AND shop_id = ?`,
          [
            data.brand ?? null,
            data.model ?? null,
            data.sellingPrice ?? null,
            data.batteryHealth ?? null,
            data.physicalCondition ?? null,
            data.accessoriesIncluded ?? null,
            data.description ?? null,
            data.status ?? null,
            nowIso,
            id,
            req.user!.shopId,
          ],
          db
        );

        // If status changed, record adjustment & movement
        if (data.status && data.status !== phone.status) {
          const adjId = 'adj_' + crypto.randomUUID();
          const reason = data.statusReason || `Status changed from ${phone.status} to ${data.status}`;

          execute(
            `INSERT INTO stock_adjustments (
              id, shop_id, item_type, product_id, product_name, previous_quantity,
              new_quantity, quantity_delta, previous_status, new_status, reason, performed_by, created_at
            ) VALUES (?, ?, 'PHONE', ?, ?, 1, 1, 0, ?, ?, ?, ?, ?)`,
            [
              adjId,
              req.user!.shopId,
              id,
              `${phone.brand} ${phone.model}`,
              phone.status,
              data.status,
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
            ) VALUES (?, ?, 'PHONE', ?, ?, ?, 'ADJUSTMENT', ?, 0, 0, ?, ?, ?)`,
            [
              'mov_' + crypto.randomUUID(),
              req.user!.shopId,
              id,
              `${phone.brand} ${phone.model}`,
              phone.imei1,
              adjId,
              reason,
              req.user!.id,
              nowIso,
            ],
            db
          );
        }
      });

      const updated = queryOne('SELECT * FROM phone_inventory WHERE id = ?', [id]);

      res.status(200).json({
        success: true,
        message: 'Phone record updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}
