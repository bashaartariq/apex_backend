import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { execute, queryAll, queryOne, SqlPrimitive } from '../database/query';

const createOverrideSchema = z.object({
  customerId: z.string().min(1),
  saleAmount: z.coerce.number().positive(),
  reason: z.string().min(3, 'Reason is mandatory for credit limit override'),
});

const reviewOverrideSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().optional(),
});

export async function requestCreditOverride(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const userId = req.user!.id;

  const parsed = createOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parsed.error.flatten() },
    });
    return;
  }

  const { customerId, saleAmount, reason } = parsed.data;
  const customer = queryOne<any>(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`, [customerId, shopId]);
  if (!customer) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    return;
  }

  const creditLimit = customer.credit_limit;
  const currentBalance = customer.outstanding_balance;
  const newBalance = currentBalance + saleAmount;
  const excessAmount = Math.max(0, newBalance - creditLimit);

  if (excessAmount <= 0) {
    res.status(400).json({
      success: false,
      error: { code: 'NO_OVERRIDE_NEEDED', message: 'Sale is already within the customer credit limit' },
    });
    return;
  }

  const isShopAdmin = req.user!.role === 'SHOP_ADMIN';
  const status = isShopAdmin ? 'APPROVED' : 'PENDING';
  const approvedBy = isShopAdmin ? userId : null;
  const now = new Date().toISOString();
  const id = `ovr_${crypto.randomUUID()}`;

  execute(
    `INSERT INTO credit_limit_overrides (
      id, shop_id, customer_id, customer_name, sale_amount, credit_limit, current_balance,
      excess_amount, status, requested_by, approved_by, reason, created_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      shopId,
      customerId,
      customer.name,
      saleAmount,
      creditLimit,
      currentBalance,
      excessAmount,
      status,
      userId,
      approvedBy,
      reason,
      now,
      isShopAdmin ? now : null,
    ]
  );

  const created = queryOne<any>(`SELECT * FROM credit_limit_overrides WHERE id = ?`, [id]);
  res.status(201).json({
    success: true,
    data: {
      id: created.id,
      shopId: created.shop_id,
      customerId: created.customer_id,
      customerName: created.customer_name,
      saleAmount: created.sale_amount,
      creditLimit: created.credit_limit,
      currentBalance: created.current_balance,
      excessAmount: created.excess_amount,
      status: created.status,
      reason: created.reason,
      createdAt: created.created_at,
    },
  });
}

export async function listCreditOverrides(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const status = req.query.status ? String(req.query.status) : '';

  let sql = `
    SELECT o.*, u.name as requester_name, a.name as approver_name
    FROM credit_limit_overrides o
    LEFT JOIN users u ON o.requested_by = u.id
    LEFT JOIN users a ON o.approved_by = a.id
    WHERE o.shop_id = ?
  `;
  const params: SqlPrimitive[] = [shopId];

  if (status) {
    sql += ` AND o.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY o.created_at DESC`;

  const rows = queryAll<any>(sql, params);
  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      saleAmount: r.sale_amount,
      creditLimit: r.credit_limit,
      currentBalance: r.current_balance,
      excessAmount: r.excess_amount,
      status: r.status,
      requesterName: r.requester_name || 'Staff',
      approverName: r.approver_name || null,
      reason: r.reason,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    })),
  });
}

export async function reviewCreditOverride(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const adminId = req.user!.id;
  const { id } = req.params;

  const existing = queryOne<any>(`SELECT * FROM credit_limit_overrides WHERE id = ? AND shop_id = ?`, [id, shopId]);
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Credit override request not found' } });
    return;
  }

  if (existing.status !== 'PENDING') {
    res.status(400).json({
      success: false,
      error: { code: 'ALREADY_REVIEWED', message: `Request is already ${existing.status}` },
    });
    return;
  }

  const parsed = reviewOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Review validation failed', details: parsed.error.flatten() },
    });
    return;
  }

  const { action } = parsed.data;
  const now = new Date().toISOString();

  if (action === 'APPROVE') {
    execute(
      `UPDATE credit_limit_overrides SET
        status = 'APPROVED', approved_by = ?, reviewed_at = ?
       WHERE id = ?`,
      [adminId, now, id]
    );
  } else {
    execute(
      `UPDATE credit_limit_overrides SET
        status = 'REJECTED', approved_by = ?, reviewed_at = ?
       WHERE id = ?`,
      [adminId, now, id]
    );
  }

  const updated = queryOne<any>(`SELECT * FROM credit_limit_overrides WHERE id = ?`, [id]);
  res.json({
    success: true,
    data: {
      id: updated.id,
      status: updated.status,
      reviewedAt: updated.reviewed_at,
    },
  });
}
