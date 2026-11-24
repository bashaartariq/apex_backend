import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { queryAll, queryOne, execute, withTransaction } from '../database/query';
import { AppError } from '../middleware/errorHandler';

const purchaseItemSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    return {
      ...val,
      itemType: val.itemType || val.item_type,
      sellingPrice: val.sellingPrice !== undefined ? val.sellingPrice : val.selling_price,
      unitCost: val.unitCost !== undefined ? val.unitCost : val.unit_cost,
      accessoryId: val.accessoryId !== undefined ? val.accessoryId : val.accessory_id,
      categoryId: val.categoryId !== undefined ? val.categoryId : val.category_id,
    };
  }
  return val;
}, z.object({
  itemType: z.enum(['PHONE', 'ACCESSORY']),
  // Phone-specific fields
  brand: z.string().trim().optional(),
  model: z.string().trim().optional(),
  imei1: z.string().trim().optional(),
  imei2: z.string().trim().optional().nullable(),
  ram: z.string().trim().optional().nullable(),
  storage: z.string().trim().optional().nullable(),
  color: z.string().trim().optional().nullable(),
  condition: z.enum(['NEW', 'USED']).default('NEW'),
  sellingPrice: z.coerce.number().min(0).default(0),
  // Accessory-specific fields
  accessoryId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  sku: z.string().trim().optional(),
  barcode: z.string().trim().optional().nullable(),
  // Shared fields
  name: z.string().trim().min(1, 'Please enter an item name.'),
  quantity: z.coerce.number().int('Quantity must be an integer.').min(1, 'Quantity must be at least 1.').default(1),
  unitCost: z.coerce.number().min(0, 'Unit cost cannot be negative.'),
  notes: z.string().trim().optional().nullable(),
}));

export const createPurchaseSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    return {
      ...val,
      supplierId: val.supplierId || val.supplier_id,
      referenceNo: val.referenceNo || val.reference_no,
      purchaseDate: val.purchaseDate || val.purchase_date,
      taxAmount: val.taxAmount !== undefined ? val.taxAmount : val.tax_amount,
      discountAmount: val.discountAmount !== undefined ? val.discountAmount : val.discount_amount,
      autoConfirm: val.autoConfirm !== undefined ? val.autoConfirm : val.auto_confirm,
    };
  }
  return val;
}, z.object({
  supplierId: z.string().min(1, 'Please select a supplier.'),
  referenceNo: z.string().trim().min(2, 'Please enter an invoice / reference number.'),
  purchaseDate: z.string().min(8, 'Please select a valid purchase date.'),
  taxAmount: z.coerce.number().min(0, 'Tax amount cannot be negative.').default(0),
  discountAmount: z.coerce.number().min(0, 'Discount amount cannot be negative.').default(0),
  notes: z.string().trim().optional().nullable(),
  items: z.array(purchaseItemSchema).min(1, 'Please add at least one line item to this purchase order.'),
  autoConfirm: z.boolean().default(false),
}));

export class PurchasesController {
  static async listPurchases(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');

      const { status, supplierId, search } = req.query as Record<string, string>;

      let sql = `
        SELECT p.*, s.name as supplier_name, s.phone as supplier_phone, u.name as created_by_name,
          (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) as item_count,
          (SELECT COALESCE(SUM(pi.quantity), 0) FROM purchase_items pi WHERE pi.purchase_id = p.id) as total_units
        FROM purchases p
        JOIN suppliers s ON s.id = p.supplier_id
        JOIN users u ON u.id = p.created_by
        WHERE p.shop_id = ?
      `;
      const params: any[] = [req.user.shopId];

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
        sql += ' AND (LOWER(p.reference_no) LIKE ? OR LOWER(s.name) LIKE ?)';
        params.push(wild, wild);
      }

      sql += ' ORDER BY p.purchase_date DESC, p.created_at DESC';

      const purchases = queryAll(sql, params);

      res.status(200).json({
        success: true,
        data: purchases,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPurchase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;

      const purchase = queryOne(
        `SELECT p.*, s.name as supplier_name, s.phone as supplier_phone, s.email as supplier_email,
                u.name as created_by_name
         FROM purchases p
         JOIN suppliers s ON s.id = p.supplier_id
         JOIN users u ON u.id = p.created_by
         WHERE p.id = ? AND p.shop_id = ?`,
        [id, req.user.shopId]
      );

      if (!purchase) {
        throw new AppError(404, 'PURCHASE_NOT_FOUND', 'Purchase record not found.');
      }

      const items = queryAll(
        `SELECT pi.*, a.sku as accessory_sku, a.name as accessory_name
         FROM purchase_items pi
         LEFT JOIN accessories a ON a.id = pi.accessory_id
         WHERE pi.purchase_id = ? AND pi.shop_id = ?`,
        [id, req.user.shopId]
      );

      res.status(200).json({
        success: true,
        data: {
          ...purchase,
          items,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async createPurchase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const data = createPurchaseSchema.parse(req.body);

      // Verify active supplier
      const supplier = queryOne<{ id: string; name: string; status: string }>(
        'SELECT id, name, status FROM suppliers WHERE id = ? AND shop_id = ?',
        [data.supplierId, req.user.shopId]
      );

      if (!supplier) {
        throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Selected supplier does not exist.');
      }

      if (supplier.status !== 'ACTIVE') {
        throw new AppError(400, 'SUPPLIER_INACTIVE', 'Cannot create a purchase order for an inactive supplier.');
      }

      // Verify unique reference number within shop
      const existingRef = queryOne<{ id: string }>(
        'SELECT id FROM purchases WHERE shop_id = ? AND reference_no = ?',
        [req.user.shopId, data.referenceNo]
      );

      if (existingRef) {
        throw new AppError(409, 'DUPLICATE_REFERENCE', `Purchase order reference "${data.referenceNo}" already exists in your shop.`);
      }

      // Validate phone items have imei1 and check duplicate IMEIs
      const imeiList: string[] = [];
      for (const item of data.items) {
        if (item.itemType === 'PHONE') {
          if (!item.imei1 || item.imei1.length < 8) {
            throw new AppError(400, 'IMEI_REQUIRED', `A valid IMEI 1 is required for phone "${item.name}".`);
          }
          if (imeiList.includes(item.imei1)) {
            throw new AppError(400, 'DUPLICATE_IMEI_IN_ORDER', `Duplicate IMEI "${item.imei1}" found within the same purchase.`);
          }
          imeiList.push(item.imei1);

          // Check if already in DB for this shop
          const existingPhone = queryOne<{ id: string }>(
            'SELECT id FROM phone_inventory WHERE shop_id = ? AND (imei1 = ? OR imei2 = ?)',
            [req.user.shopId, item.imei1, item.imei1]
          );
          if (existingPhone) {
            throw new AppError(409, 'DUPLICATE_IMEI', `Phone with IMEI "${item.imei1}" is already registered in your store.`);
          }
        }
      }

      // Calculate totals
      let subtotal = 0;
      for (const item of data.items) {
        subtotal += item.unitCost * item.quantity;
      }
      const totalAmount = Math.max(0, subtotal + data.taxAmount - data.discountAmount);

      const purchaseId = 'po_' + crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const status = data.autoConfirm ? 'CONFIRMED' : 'DRAFT';

      withTransaction((db) => {
        execute(
          `INSERT INTO purchases (
            id, shop_id, supplier_id, reference_no, purchase_date, status,
            total_amount, tax_amount, discount_amount, notes, created_by,
            confirmed_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            purchaseId,
            req.user!.shopId,
            data.supplierId,
            data.referenceNo,
            data.purchaseDate,
            status,
            totalAmount,
            data.taxAmount,
            data.discountAmount,
            data.notes || null,
            req.user!.id,
            data.autoConfirm ? nowIso : null,
            nowIso,
            nowIso,
          ],
          db
        );

        // Insert purchase items and apply stock if autoConfirm
        for (const item of data.items) {
          const itemId = 'pi_' + crypto.randomUUID();
          const itemSubtotal = item.unitCost * item.quantity;

          execute(
            `INSERT INTO purchase_items (
              id, purchase_id, shop_id, item_type, product_id, accessory_id,
              name, quantity, unit_cost, subtotal, details, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              itemId,
              purchaseId,
              req.user!.shopId,
              item.itemType,
              null, // linked on confirmation
              item.accessoryId || null,
              item.name,
              item.quantity,
              item.unitCost,
              itemSubtotal,
              JSON.stringify(item),
              nowIso,
            ],
            db
          );

          if (data.autoConfirm) {
            PurchasesController.applyItemStock(db, req.user!.shopId, req.user!.id, purchaseId, data.referenceNo, data.supplierId, data.purchaseDate, item);
          }
        }
      });

      const created = queryOne('SELECT * FROM purchases WHERE id = ?', [purchaseId]);

      res.status(201).json({
        success: true,
        message: data.autoConfirm
          ? `Purchase Order ${data.referenceNo} confirmed and inventory updated.`
          : `Purchase Order ${data.referenceNo} drafted successfully.`,
        data: created,
      });
    } catch (err) {
      next(err);
    }
  }

  static async confirmPurchase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;

      const purchase = queryOne<{
        id: string;
        shop_id: string;
        supplier_id: string;
        reference_no: string;
        purchase_date: string;
        status: string;
      }>('SELECT * FROM purchases WHERE id = ? AND shop_id = ?', [id, req.user.shopId]);

      if (!purchase) {
        throw new AppError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found.');
      }

      if (purchase.status === 'CONFIRMED') {
        throw new AppError(400, 'ALREADY_CONFIRMED', 'This purchase order has already been confirmed and received into inventory.');
      }

      if (purchase.status === 'CANCELLED') {
        throw new AppError(400, 'PURCHASE_CANCELLED', 'Cancelled purchases cannot be confirmed.');
      }

      const items = queryAll<{
        id: string;
        item_type: 'PHONE' | 'ACCESSORY';
        name: string;
        accessory_id: string | null;
        quantity: number;
        unit_cost: number;
        details: string | null;
      }>('SELECT * FROM purchase_items WHERE purchase_id = ? AND shop_id = ?', [id, req.user.shopId]);

      const nowIso = new Date().toISOString();

      withTransaction((db) => {
        // Mark purchase as CONFIRMED
        execute(
          `UPDATE purchases SET status = 'CONFIRMED', confirmed_at = ?, updated_at = ? WHERE id = ? AND shop_id = ?`,
          [nowIso, nowIso, id, req.user!.shopId],
          db
        );

        for (const rawItem of items) {
          const parsedDetails = rawItem.details ? JSON.parse(rawItem.details) : {};
          const itemPayload = {
            ...parsedDetails,
            itemType: rawItem.item_type,
            name: rawItem.name,
            quantity: rawItem.quantity,
            unitCost: rawItem.unit_cost,
            accessoryId: rawItem.accessory_id,
          };

          PurchasesController.applyItemStock(
            db,
            req.user!.shopId,
            req.user!.id,
            purchase.id,
            purchase.reference_no,
            purchase.supplier_id,
            purchase.purchase_date,
            itemPayload
          );
        }
      });

      const confirmed = queryOne('SELECT * FROM purchases WHERE id = ?', [id]);

      res.status(200).json({
        success: true,
        message: `Purchase order "${purchase.reference_no}" confirmed. Inventory received successfully.`,
        data: confirmed,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Internal transaction helper to register phones or accessories and their FIFO batches.
   */
  private static applyItemStock(
    db: any,
    shopId: string,
    userId: string,
    purchaseId: string,
    refNo: string,
    supplierId: string,
    purchaseDate: string,
    item: any
  ): void {
    const nowIso = new Date().toISOString();

    if (item.itemType === 'PHONE') {
      const phoneId = 'phone_' + crypto.randomUUID();

      // Check duplicate
      const duplicate = queryOne<{ id: string }>(
        'SELECT id FROM phone_inventory WHERE shop_id = ? AND (imei1 = ? OR imei2 = ?)',
        [shopId, item.imei1, item.imei1],
        db
      );

      if (duplicate) {
        throw new AppError(409, 'DUPLICATE_IMEI', `Cannot confirm purchase: IMEI "${item.imei1}" is already registered in store.`);
      }

      execute(
        `INSERT INTO phone_inventory (
          id, shop_id, supplier_id, purchase_id, brand, model, imei1, imei2, ram, storage, color,
          condition, purchase_cost, selling_price, battery_health, physical_condition,
          accessories_included, description, status, purchase_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_STOCK', ?, ?, ?)`,
        [
          phoneId,
          shopId,
          supplierId,
          purchaseId,
          item.brand || item.name.split(' ')[0] || 'Generic',
          item.model || item.name,
          item.imei1,
          item.imei2 || null,
          item.ram || null,
          item.storage || null,
          item.color || null,
          item.condition || 'NEW',
          item.unitCost,
          item.sellingPrice || item.unitCost * 1.25,
          item.batteryHealth ?? (item.condition === 'NEW' ? 100 : null),
          item.physicalCondition || null,
          item.accessoriesIncluded || null,
          item.notes || null,
          purchaseDate,
          nowIso,
          nowIso,
        ],
        db
      );

      // Record movement
      execute(
        `INSERT INTO stock_movements (
          id, shop_id, item_type, product_id, product_name, identifier, movement_type,
          reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
        ) VALUES (?, ?, 'PHONE', ?, ?, ?, 'PURCHASE', ?, 1, ?, ?, ?, ?)`,
        [
          'mov_' + crypto.randomUUID(),
          shopId,
          phoneId,
          `${item.brand || ''} ${item.model || item.name}`.trim(),
          item.imei1,
          purchaseId,
          item.unitCost,
          `Received via Purchase Order ${refNo}`,
          userId,
          nowIso,
        ],
        db
      );
    } else if (item.itemType === 'ACCESSORY') {
      let accessoryId = item.accessoryId;

      // If accessory not selected, check by SKU or create
      if (!accessoryId && item.sku) {
        const found = queryOne<{ id: string }>(
          'SELECT id FROM accessories WHERE shop_id = ? AND sku = ?',
          [shopId, item.sku],
          db
        );
        if (found) {
          accessoryId = found.id;
        }
      }

      if (!accessoryId) {
        // Create new accessory
        accessoryId = 'acc_' + crypto.randomUUID();
        const generatedSku = item.sku || `SKU-${Date.now().toString().slice(-6)}`;

        let catId = item.categoryId;
        if (!catId) {
          const defaultCat = queryOne<{ id: string }>(
            'SELECT id FROM accessory_categories WHERE shop_id = ? LIMIT 1',
            [shopId],
            db
          );
          catId = defaultCat ? defaultCat.id : 'cat_default';
        }

        execute(
          `INSERT INTO accessories (
            id, shop_id, category_id, supplier_id, name, brand, model, sku, barcode,
            purchase_cost, selling_price, available_quantity, min_stock_threshold, description,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, ?, 'ACTIVE', ?, ?)`,
          [
            accessoryId,
            shopId,
            catId,
            supplierId,
            item.name,
            item.brand || 'Generic',
            item.model || null,
            generatedSku,
            item.barcode || null,
            item.unitCost,
            item.sellingPrice || item.unitCost * 1.5,
            item.quantity,
            item.notes || null,
            nowIso,
            nowIso,
          ],
          db
        );
      } else {
        // Update existing accessory quantity & latest cost
        execute(
          `UPDATE accessories SET
            available_quantity = available_quantity + ?,
            purchase_cost = ?,
            updated_at = ?
           WHERE id = ? AND shop_id = ?`,
          [item.quantity, item.unitCost, nowIso, accessoryId, shopId],
          db
        );
      }

      // Create FIFO batch record
      const batchNo = `BATCH-${refNo}-${Date.now().toString().slice(-4)}`;
      execute(
        `INSERT INTO accessory_batches (
          id, shop_id, accessory_id, purchase_id, batch_no, unit_cost,
          initial_quantity, remaining_quantity, purchase_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'batch_' + crypto.randomUUID(),
          shopId,
          accessoryId,
          purchaseId,
          batchNo,
          item.unitCost,
          item.quantity,
          item.quantity,
          purchaseDate,
          nowIso,
        ],
        db
      );

      // Record movement
      execute(
        `INSERT INTO stock_movements (
          id, shop_id, item_type, product_id, product_name, identifier, movement_type,
          reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
        ) VALUES (?, ?, 'ACCESSORY', ?, ?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?)`,
        [
          'mov_' + crypto.randomUUID(),
          shopId,
          accessoryId,
          item.name,
          item.sku || 'ACCESSORY',
          purchaseId,
          item.quantity,
          item.unitCost,
          `Received via Purchase Order ${refNo}`,
          userId,
          nowIso,
        ],
        db
      );

      // Auto-resolve any low stock alerts if quantity now exceeds threshold
      const acc = queryOne<{ available_quantity: number; min_stock_threshold: number }>(
        'SELECT available_quantity, min_stock_threshold FROM accessories WHERE id = ?',
        [accessoryId],
        db
      );

      if (acc && acc.available_quantity > acc.min_stock_threshold) {
        execute(
          `UPDATE low_stock_alerts SET status = 'RESOLVED', resolved_at = ?
           WHERE accessory_id = ? AND shop_id = ? AND status = 'ACTIVE'`,
          [nowIso, accessoryId, shopId],
          db
        );
      }
    }
  }
}
