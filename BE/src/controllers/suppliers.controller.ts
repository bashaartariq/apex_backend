import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { queryAll, queryOne, execute } from '../database/query';
import { AppError } from '../middleware/errorHandler';

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Please enter a supplier company name.'),
  contactPerson: z.string().trim().optional().nullable(),
  phone: z.string().trim().min(5, 'Please enter a valid phone number.'),
  email: z.string().trim().email('Please enter a valid email address.').optional().nullable().or(z.literal('')),
  address: z.string().trim().optional().nullable(),
  businessId: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export class SuppliersController {
  static async listSuppliers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');

      const search = (req.query.search as string)?.trim().toLowerCase();
      const status = req.query.status as string;

      let sql = `
        SELECT s.*,
          (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id) as purchase_count,
          (SELECT COALESCE(SUM(p.total_amount), 0) FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'CONFIRMED') as total_spend
        FROM suppliers s
        WHERE s.shop_id = ?
      `;
      const params: any[] = [req.user.shopId];

      if (status && (status === 'ACTIVE' || status === 'INACTIVE')) {
        sql += ' AND s.status = ?';
        params.push(status);
      }

      if (search) {
        sql += ' AND (LOWER(s.name) LIKE ? OR LOWER(s.phone) LIKE ? OR LOWER(COALESCE(s.contact_person, "")) LIKE ?)';
        const wild = `%${search}%`;
        params.push(wild, wild, wild);
      }

      sql += ' ORDER BY s.name ASC';

      const suppliers = queryAll(sql, params);

      res.status(200).json({
        success: true,
        data: suppliers,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;

      const supplier = queryOne(
        `SELECT * FROM suppliers WHERE id = ? AND shop_id = ?`,
        [id, req.user.shopId]
      );

      if (!supplier) {
        throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found.');
      }

      // Recent purchases from this supplier
      const purchases = queryAll(
        `SELECT id, reference_no, purchase_date, status, total_amount, created_at
         FROM purchases
         WHERE supplier_id = ? AND shop_id = ?
         ORDER BY purchase_date DESC LIMIT 10`,
        [id, req.user.shopId]
      );

      res.status(200).json({
        success: true,
        data: {
          ...supplier,
          recentPurchases: purchases,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async createSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const data = createSupplierSchema.parse(req.body);

      const id = 'supp_' + crypto.randomUUID();
      const nowIso = new Date().toISOString();

      execute(
        `INSERT INTO suppliers (id, shop_id, name, contact_person, phone, email, address, business_id, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
        [
          id,
          req.user.shopId,
          data.name,
          data.contactPerson || null,
          data.phone,
          data.email || null,
          data.address || null,
          data.businessId || null,
          data.notes || null,
          nowIso,
          nowIso,
        ]
      );

      const created = queryOne('SELECT * FROM suppliers WHERE id = ?', [id]);

      res.status(201).json({
        success: true,
        message: `Supplier "${data.name}" added successfully.`,
        data: created,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;
      const data = updateSupplierSchema.parse(req.body);

      const existing = queryOne<{ id: string }>('SELECT id FROM suppliers WHERE id = ? AND shop_id = ?', [id, req.user.shopId]);
      if (!existing) {
        throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found.');
      }

      const nowIso = new Date().toISOString();

      execute(
        `UPDATE suppliers SET
          name = COALESCE(?, name),
          contact_person = COALESCE(?, contact_person),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          address = COALESCE(?, address),
          business_id = COALESCE(?, business_id),
          notes = COALESCE(?, notes),
          status = COALESCE(?, status),
          updated_at = ?
         WHERE id = ? AND shop_id = ?`,
        [
          data.name ?? null,
          data.contactPerson ?? null,
          data.phone ?? null,
          data.email ?? null,
          data.address ?? null,
          data.businessId ?? null,
          data.notes ?? null,
          data.status ?? null,
          nowIso,
          id,
          req.user.shopId,
        ]
      );

      const updated = queryOne('SELECT * FROM suppliers WHERE id = ?', [id]);

      res.status(200).json({
        success: true,
        message: 'Supplier updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      const { id } = req.params;
      const { status } = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).parse(req.body);

      const existing = queryOne<{ id: string }>('SELECT id FROM suppliers WHERE id = ? AND shop_id = ?', [id, req.user.shopId]);
      if (!existing) {
        throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found.');
      }

      execute(
        `UPDATE suppliers SET status = ?, updated_at = ? WHERE id = ? AND shop_id = ?`,
        [status, new Date().toISOString(), id, req.user.shopId]
      );

      res.status(200).json({
        success: true,
        message: `Supplier status changed to ${status}.`,
        data: { id, status },
      });
    } catch (err) {
      next(err);
    }
  }
}
