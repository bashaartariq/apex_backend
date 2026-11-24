import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { execute, queryAll, queryOne, SqlPrimitive } from '../database/query';

const createDiscountRequestSchema = z.object({
  itemType: z.enum(['PHONE', 'ACCESSORY']),
  productId: z.string().min(1),
  productName: z.string().min(1),
  defaultPrice: z.coerce.number().positive(),
  requestedPrice: z.coerce.number().min(0),
  reason: z.string().min(3, 'Reason is mandatory for discount request'),
});

const reviewDiscountSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  approvedAmount: z.coerce.number().optional(),
  rejectionReason: z.string().optional(),
});

export async function requestDiscount(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const userId = req.user!.id;

  const parsed = createDiscountRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid discount request payload', details: parsed.error.flatten() },
    });
    return;
  }

  const { itemType, productId, productName, defaultPrice, requestedPrice, reason } = parsed.data;

  if (requestedPrice >= defaultPrice) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_DISCOUNT', message: 'Requested price must be less than default selling price to require discount approval' },
    });
    return;
  }

  const discountAmount = defaultPrice - requestedPrice;
  const id = `disc_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  // If user is already SHOP_ADMIN, auto-approve immediately
  const isShopAdmin = req.user!.role === 'SHOP_ADMIN';
  const status = isShopAdmin ? 'APPROVED' : 'PENDING';
  const approvedBy = isShopAdmin ? userId : null;
  const approvedAmount = isShopAdmin ? discountAmount : null;
  const reviewedAt = isShopAdmin ? now : null;

  execute(
    `INSERT INTO discount_requests (
      id, shop_id, item_type, product_id, product_name, default_price, requested_price,
      discount_amount, reason, status, requested_by, approved_by, approved_amount, created_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      shopId,
      itemType,
      productId,
      productName,
      defaultPrice,
      requestedPrice,
      discountAmount,
      reason,
      status,
      userId,
      approvedBy,
      approvedAmount,
      now,
      reviewedAt,
    ]
  );

  const created = queryOne<any>(`SELECT * FROM discount_requests WHERE id = ?`, [id]);
  res.status(201).json({
    success: true,
    data: {
      id: created.id,
      shopId: created.shop_id,
      itemType: created.item_type,
      productId: created.product_id,
      productName: created.product_name,
      defaultPrice: created.default_price,
      requestedPrice: created.requested_price,
      discountAmount: created.discount_amount,
      reason: created.reason,
      status: created.status,
      requestedBy: created.requested_by,
      approvedBy: created.approved_by,
      approvedAmount: created.approved_amount,
      createdAt: created.created_at,
    },
  });
}

export async function listDiscountRequests(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const status = req.query.status ? String(req.query.status) : '';

  let sql = `
    SELECT d.*, u.name as requester_name, a.name as approver_name
    FROM discount_requests d
    LEFT JOIN users u ON d.requested_by = u.id
    LEFT JOIN users a ON d.approved_by = a.id
    WHERE d.shop_id = ?
  `;
  const params: SqlPrimitive[] = [shopId];

  if (status) {
    sql += ` AND d.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY d.created_at DESC`;

  const rows = queryAll<any>(sql, params);
  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      itemType: r.item_type,
      productId: r.product_id,
      productName: r.product_name,
      defaultPrice: r.default_price,
      requestedPrice: r.requested_price,
      discountAmount: r.discount_amount,
      reason: r.reason,
      status: r.status,
      requesterName: r.requester_name || 'Staff',
      approverName: r.approver_name || null,
      approvedAmount: r.approved_amount,
      rejectionReason: r.rejection_reason,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
    })),
  });
}

export async function reviewDiscountRequest(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const adminId = req.user!.id;
  const { id } = req.params;

  const existing = queryOne<any>(`SELECT * FROM discount_requests WHERE id = ? AND shop_id = ?`, [id, shopId]);
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Discount request not found' } });
    return;
  }

  if (existing.status !== 'PENDING') {
    res.status(400).json({
      success: false,
      error: { code: 'ALREADY_REVIEWED', message: `Request is already ${existing.status}` },
    });
    return;
  }

  const parsed = reviewDiscountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Review data invalid', details: parsed.error.flatten() },
    });
    return;
  }

  const { action, approvedAmount, rejectionReason } = parsed.data;
  const now = new Date().toISOString();

  if (action === 'APPROVE') {
    const finalAmount = approvedAmount ?? existing.discount_amount;
    execute(
      `UPDATE discount_requests SET
        status = 'APPROVED', approved_by = ?, approved_amount = ?, reviewed_at = ?
       WHERE id = ?`,
      [adminId, finalAmount, now, id]
    );
  } else {
    execute(
      `UPDATE discount_requests SET
        status = 'REJECTED', approved_by = ?, rejection_reason = ?, reviewed_at = ?
       WHERE id = ?`,
      [adminId, rejectionReason || 'Rejected by shop administrator', now, id]
    );
  }

  const updated = queryOne<any>(`SELECT * FROM discount_requests WHERE id = ?`, [id]);
  res.json({
    success: true,
    data: {
      id: updated.id,
      status: updated.status,
      approvedAmount: updated.approved_amount,
      rejectionReason: updated.rejection_reason,
      reviewedAt: updated.reviewed_at,
    },
  });
}
