import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { queryAll, queryOne, withTransaction, SqlPrimitive } from '../database/query';
import { getNextClaimRef } from '../utils/sequences';

const createClaimSchema = z.object({
  warrantyId: z.string().min(1),
  problemDescription: z.string().min(5, 'Problem description is required'),
});

const updateClaimSchema = z.object({
  status: z.enum([
    'REGISTERED',
    'UNDER_INSPECTION',
    'APPROVED',
    'REJECTED',
    'SENT_TO_SUPPLIER',
    'UNDER_REPAIR',
    'REPAIRED',
    'REPLACEMENT',
    'REFUND',
    'READY_FOR_COLLECTION',
    'DELIVERED',
    'CLOSED',
  ]),
  repairNotes: z.string().optional().default(''),
  partsUsed: z.string().optional().default(''),
  laborCost: z.coerce.number().min(0).default(0),
  customerCharge: z.coerce.number().min(0).default(0),
  replacementImei: z.string().optional().default(''),
});

export async function listWarranties(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const search = req.query.search ? String(req.query.search).trim() : '';

  let sql = `
    SELECT w.*, s.invoice_no, c.name as customer_name, c.phone as customer_phone
    FROM warranty_records w
    LEFT JOIN sales s ON w.sale_id = s.id
    LEFT JOIN customers c ON w.customer_id = c.id
    WHERE w.shop_id = ?
  `;
  const params: SqlPrimitive[] = [shopId];

  if (search) {
    sql += ` AND (w.identifier LIKE ? OR w.product_name LIKE ? OR s.invoice_no LIKE ? OR c.name LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
  }

  sql += ` ORDER BY w.created_at DESC LIMIT 100`;

  const rows = queryAll<any>(sql, params);
  res.json({
    success: true,
    data: rows.map((w) => ({
      id: w.id,
      saleId: w.sale_id,
      invoiceNo: w.invoice_no,
      customerId: w.customer_id,
      customerName: w.customer_name || 'Walk-in',
      customerPhone: w.customer_phone || '',
      itemType: w.item_type,
      productName: w.product_name,
      identifier: w.identifier,
      warrantyType: w.warranty_type,
      providerName: w.provider_name,
      durationMonths: w.duration_months,
      startDate: w.start_date,
      endDate: w.end_date,
      terms: w.terms,
      status: w.status,
      createdAt: w.created_at,
    })),
  });
}

export async function listClaims(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const status = req.query.status ? String(req.query.status) : '';

  let sql = `
    SELECT c.*, w.product_name, w.identifier, s.invoice_no, cust.name as customer_name,
           u1.name as registered_by_name, u2.name as resolved_by_name
    FROM warranty_claims c
    LEFT JOIN warranty_records w ON c.warranty_id = w.id
    LEFT JOIN sales s ON c.sale_id = s.id
    LEFT JOIN customers cust ON c.customer_id = cust.id
    LEFT JOIN users u1 ON c.registered_by = u1.id
    LEFT JOIN users u2 ON c.resolved_by = u2.id
    WHERE c.shop_id = ?
  `;
  const params: SqlPrimitive[] = [shopId];

  if (status) {
    sql += ` AND c.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY c.created_at DESC LIMIT 100`;

  const rows = queryAll<any>(sql, params);
  res.json({
    success: true,
    data: rows.map((c) => ({
      id: c.id,
      claimRef: c.claim_ref,
      warrantyId: c.warranty_id,
      invoiceNo: c.invoice_no,
      customerName: c.customer_name || 'Walk-in Customer',
      productName: c.product_name,
      identifier: c.identifier,
      problemDescription: c.problem_description,
      status: c.status,
      repairNotes: c.repair_notes,
      partsUsed: c.parts_used,
      laborCost: c.labor_cost,
      customerCharge: c.customer_charge,
      replacementImei: c.replacement_imei,
      registeredByName: c.registered_by_name || 'Staff',
      resolvedByName: c.resolved_by_name || null,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
  });
}

export async function createWarrantyClaim(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const userId = req.user!.id;

  const parsed = createClaimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Claim validation failed', details: parsed.error.flatten() },
    });
    return;
  }

  const { warrantyId, problemDescription } = parsed.data;

  try {
    const claim = withTransaction((db) => {
      const warranty = db.prepare(`SELECT * FROM warranty_records WHERE id = ? AND shop_id = ?`).get(warrantyId, shopId) as any;
      if (!warranty) {
        throw new Error('Warranty record not found');
      }
      if (warranty.status === 'VOID') {
        throw new Error('This warranty has been voided due to item return or cancellation');
      }

      const today = new Date().toISOString().slice(0, 10);
      if (warranty.end_date < today) {
        throw new Error(`Warranty has expired on ${warranty.end_date}`);
      }

      const nowIso = new Date().toISOString();
      const claimRef = getNextClaimRef(shopId, db);
      const claimId = `claim_${crypto.randomUUID()}`;

      // Mark phone under repair if phone
      if (warranty.item_type === 'PHONE' && warranty.product_id) {
        db.prepare(`UPDATE phone_inventory SET status = 'UNDER_REPAIR', updated_at = ? WHERE id = ?`).run(nowIso, warranty.product_id);
      }

      db.prepare(`
        INSERT INTO warranty_claims (
          id, shop_id, claim_ref, warranty_id, sale_id, customer_id, problem_description,
          status, registered_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'REGISTERED', ?, ?, ?)
      `).run(
        claimId,
        shopId,
        claimRef,
        warrantyId,
        warranty.sale_id,
        warranty.customer_id,
        problemDescription,
        userId,
        nowIso,
        nowIso
      );

      return {
        id: claimId,
        claimRef,
        warrantyId,
        productName: warranty.product_name,
        identifier: warranty.identifier,
        status: 'REGISTERED',
        problemDescription,
        createdAt: nowIso,
      };
    });

    res.status(201).json({ success: true, data: claim });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'CLAIM_FAILED', message: err.message } });
  }
}

export async function updateWarrantyClaim(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const userId = req.user!.id;
  const { id } = req.params;

  const existing = queryOne<any>(`SELECT * FROM warranty_claims WHERE id = ? AND shop_id = ?`, [id, shopId]);
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Warranty claim not found' } });
    return;
  }

  const parsed = updateClaimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: parsed.error.flatten() },
    });
    return;
  }

  const { status, repairNotes, partsUsed, laborCost, customerCharge, replacementImei } = parsed.data;
  const nowIso = new Date().toISOString();

  // If claim closed or delivered, we can unblock the phone or record resolution
  let resolvedAt: string | null = existing.resolved_at;
  let resolvedBy: string | null = existing.resolved_by;

  if (['CLOSED', 'DELIVERED', 'REPAIRED', 'REJECTED'].includes(status)) {
    resolvedAt = nowIso;
    resolvedBy = userId;
  }

  withTransaction((db) => {
    db.prepare(`
      UPDATE warranty_claims SET
        status = ?, repair_notes = ?, parts_used = ?, labor_cost = ?,
        customer_charge = ?, replacement_imei = ?, resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE id = ? AND shop_id = ?
    `).run(
      status,
      repairNotes,
      partsUsed,
      laborCost,
      customerCharge,
      replacementImei,
      resolvedBy,
      resolvedAt,
      nowIso,
      id,
      shopId
    );

    // If claim was rejected or closed, restore phone status if still under repair
    if (['CLOSED', 'DELIVERED'].includes(status)) {
      const warranty = db.prepare(`SELECT * FROM warranty_records WHERE id = ?`).get(existing.warranty_id) as any;
      if (warranty && warranty.item_type === 'PHONE' && warranty.product_id) {
        db.prepare(`UPDATE phone_inventory SET status = 'SOLD', updated_at = ? WHERE id = ? AND status = 'UNDER_REPAIR'`).run(
          nowIso,
          warranty.product_id
        );
      }
    }
  });

  const updated = queryOne<any>(`SELECT * FROM warranty_claims WHERE id = ?`, [id]);
  res.json({
    success: true,
    data: {
      id: updated.id,
      claimRef: updated.claim_ref,
      status: updated.status,
      repairNotes: updated.repair_notes,
      partsUsed: updated.parts_used,
      laborCost: updated.labor_cost,
      customerCharge: updated.customer_charge,
      replacementImei: updated.replacement_imei,
      resolvedAt: updated.resolved_at,
      updatedAt: updated.updated_at,
    },
  });
}
