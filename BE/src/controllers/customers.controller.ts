import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { execute, queryAll, queryOne, SqlPrimitive } from '../database/query';
import { validateCnic, normalizeCnic, maskCnic, hashCnic, encryptCnic, decryptCnic } from '../utils/cnic';

const customerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter a customer name of at least 2 characters.'),
  phone: z
    .string()
    .trim()
    .refine((val) => !val || /^[0-9+\s\-()]{7,20}$/.test(val), {
      message: 'Please enter a valid phone number.',
    })
    .optional()
    .default(''),
  cnic: z
    .string()
    .trim()
    .refine((val) => !val || validateCnic(val), {
      message: 'Please enter a valid 13-digit CNIC number.',
    })
    .optional()
    .default(''),
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address.')
    .optional()
    .or(z.literal(''))
    .default(''),
  address: z.string().trim().optional().default(''),
  creditLimit: z.coerce.number().min(0, 'Credit limit cannot be negative.').optional().default(0),
  notes: z.string().trim().optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE'], {
    errorMap: () => ({ message: 'Status must be ACTIVE or INACTIVE.' }),
  }).default('ACTIVE'),
});

const updateCustomerSchema = customerSchema.partial();

export async function listCustomers(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const search = req.query.search ? String(req.query.search).trim() : '';
  const status = req.query.status ? String(req.query.status) : '';

  let sql = `SELECT * FROM customers WHERE shop_id = ?`;
  const params: SqlPrimitive[] = [shopId];

  if (status) {
    sql += ` AND status = ?`;
    params.push(status);
  }

  if (search) {
    sql += ` AND (name LIKE ? OR phone LIKE ? OR cnic_masked LIKE ? OR email LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
  }

  sql += ` ORDER BY name ASC`;

  const customers = queryAll<any>(sql, params);
  res.json({
    success: true,
    data: customers.map((c) => ({
      id: c.id,
      shopId: c.shop_id,
      name: c.name,
      phone: c.phone || '',
      cnicMasked: c.cnic_masked || null,
      hasCnic: !!c.cnic_hash,
      email: c.email || '',
      address: c.address || '',
      creditLimit: c.credit_limit,
      outstandingBalance: c.outstanding_balance,
      availableCredit: Math.max(0, c.credit_limit - c.outstanding_balance),
      status: c.status,
      notes: c.notes || '',
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
  });
}

export async function getCustomerById(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { id } = req.params;

  const customer = queryOne<any>(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`, [id, shopId]);
  if (!customer) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    return;
  }

  res.json({
    success: true,
    data: {
      id: customer.id,
      shopId: customer.shop_id,
      name: customer.name,
      phone: customer.phone || '',
      cnicMasked: customer.cnic_masked || null,
      hasCnic: !!customer.cnic_hash,
      email: customer.email || '',
      address: customer.address || '',
      creditLimit: customer.credit_limit,
      outstandingBalance: customer.outstanding_balance,
      availableCredit: Math.max(0, customer.credit_limit - customer.outstanding_balance),
      status: customer.status,
      notes: customer.notes || '',
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
    },
  });
}

export async function createCustomer(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
      if (messages && messages.length > 0) fieldErrors[field] = messages[0];
    }
    const firstIssue = parsed.error.issues[0];
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: firstIssue?.message || 'Please check customer details and try again.',
        fieldErrors,
        details: flattened,
      },
    });
    return;
  }

  const { name, phone, cnic, email, address, creditLimit, notes, status } = parsed.data;

  let cnicEncrypted: string | null = null;
  let cnicMasked: string | null = null;
  let cnicHashVal: string | null = null;

  if (cnic && cnic.trim().length > 0) {
    if (!validateCnic(cnic)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_CNIC', message: 'CNIC must be 13 numeric digits (e.g., 42101-1234567-1)' },
      });
      return;
    }
    const norm = normalizeCnic(cnic);
    cnicEncrypted = encryptCnic(norm);
    cnicMasked = maskCnic(norm);
    cnicHashVal = hashCnic(norm);

    // Check uniqueness within this shop
    const existing = queryOne<any>(`SELECT id FROM customers WHERE shop_id = ? AND cnic_hash = ?`, [shopId, cnicHashVal]);
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_CNIC', message: 'A customer with this CNIC is already registered in this shop' },
      });
      return;
    }
  }

  const id = `cust_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  execute(
    `INSERT INTO customers (
      id, shop_id, name, phone, cnic_encrypted, cnic_masked, cnic_hash, email, address,
      credit_limit, outstanding_balance, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?)`,
    [id, shopId, name, phone, cnicEncrypted, cnicMasked, cnicHashVal, email, address, creditLimit, status, notes, now, now]
  );

  const created = queryOne<any>(`SELECT * FROM customers WHERE id = ?`, [id]);
  res.status(201).json({
    success: true,
    data: {
      id: created.id,
      shopId: created.shop_id,
      name: created.name,
      phone: created.phone || '',
      cnicMasked: created.cnic_masked || null,
      hasCnic: !!created.cnic_hash,
      email: created.email || '',
      address: created.address || '',
      creditLimit: created.credit_limit,
      outstandingBalance: created.outstanding_balance,
      availableCredit: Math.max(0, created.credit_limit - created.outstanding_balance),
      status: created.status,
      notes: created.notes || '',
      createdAt: created.created_at,
    },
  });
}

export async function updateCustomer(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { id } = req.params;

  const existing = queryOne<any>(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`, [id, shopId]);
  if (!existing) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    return;
  }

  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
      if (messages && messages.length > 0) fieldErrors[field] = messages[0];
    }
    const firstIssue = parsed.error.issues[0];
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: firstIssue?.message || 'Please check customer details and try again.',
        fieldErrors,
        details: flattened,
      },
    });
    return;
  }

  const updates = parsed.data;
  let cnicEncrypted = existing.cnic_encrypted;
  let cnicMasked = existing.cnic_masked;
  let cnicHashVal = existing.cnic_hash;

  if (updates.cnic !== undefined) {
    if (updates.cnic && updates.cnic.trim().length > 0) {
      if (!validateCnic(updates.cnic)) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_CNIC', message: 'CNIC must be 13 digits (XXXXX-XXXXXXX-X)' },
        });
        return;
      }
      const norm = normalizeCnic(updates.cnic);
      cnicEncrypted = encryptCnic(norm);
      cnicMasked = maskCnic(norm);
      cnicHashVal = hashCnic(norm);

      // Check if duplicate for another customer in this shop
      const dup = queryOne<any>(`SELECT id FROM customers WHERE shop_id = ? AND cnic_hash = ? AND id != ?`, [
        shopId,
        cnicHashVal,
        id,
      ]);
      if (dup) {
        res.status(409).json({
          success: false,
          error: { code: 'DUPLICATE_CNIC', message: 'Another customer in this shop already has this CNIC' },
        });
        return;
      }
    } else {
      cnicEncrypted = null;
      cnicMasked = null;
      cnicHashVal = null;
    }
  }

  const name = updates.name ?? existing.name;
  const phone = updates.phone ?? existing.phone;
  const email = updates.email ?? existing.email;
  const address = updates.address ?? existing.address;
  const creditLimit = updates.creditLimit ?? existing.credit_limit;
  const status = updates.status ?? existing.status;
  const notes = updates.notes ?? existing.notes;
  const now = new Date().toISOString();

  execute(
    `UPDATE customers SET
      name = ?, phone = ?, cnic_encrypted = ?, cnic_masked = ?, cnic_hash = ?,
      email = ?, address = ?, credit_limit = ?, status = ?, notes = ?, updated_at = ?
     WHERE id = ? AND shop_id = ?`,
    [name, phone, cnicEncrypted, cnicMasked, cnicHashVal, email, address, creditLimit, status, notes, now, id, shopId]
  );

  const updated = queryOne<any>(`SELECT * FROM customers WHERE id = ?`, [id]);
  res.json({
    success: true,
    data: {
      id: updated.id,
      shopId: updated.shop_id,
      name: updated.name,
      phone: updated.phone || '',
      cnicMasked: updated.cnic_masked || null,
      hasCnic: !!updated.cnic_hash,
      email: updated.email || '',
      address: updated.address || '',
      creditLimit: updated.credit_limit,
      outstandingBalance: updated.outstanding_balance,
      availableCredit: Math.max(0, updated.credit_limit - updated.outstanding_balance),
      status: updated.status,
      notes: updated.notes || '',
      updatedAt: updated.updated_at,
    },
  });
}

export async function getCustomerStatement(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { id } = req.params;

  const customer = queryOne<any>(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`, [id, shopId]);
  if (!customer) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    return;
  }

  const sales = queryAll<any>(
    `SELECT id, invoice_no, subtotal, discount_amount, tax_amount, total_amount, amount_paid, balance_due, payment_status, created_at
     FROM sales WHERE customer_id = ? AND shop_id = ? ORDER BY created_at DESC`,
    [id, shopId]
  );

  const receipts = queryAll<any>(
    `SELECT id, receipt_no, sale_id, payment_method, amount_received, previous_balance, remaining_balance, created_at
     FROM customer_payment_receipts WHERE customer_id = ? AND shop_id = ? ORDER BY created_at DESC`,
    [id, shopId]
  );

  res.json({
    success: true,
    data: {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        cnicMasked: customer.cnic_masked,
        creditLimit: customer.credit_limit,
        outstandingBalance: customer.outstanding_balance,
        availableCredit: Math.max(0, customer.credit_limit - customer.outstanding_balance),
      },
      sales: sales.map((s) => ({
        id: s.id,
        invoiceNo: s.invoice_no,
        subtotal: s.subtotal,
        discountAmount: s.discount_amount,
        taxAmount: s.tax_amount,
        totalAmount: s.total_amount,
        amountPaid: s.amount_paid,
        balanceDue: s.balance_due,
        paymentStatus: s.payment_status,
        createdAt: s.created_at,
      })),
      receipts: receipts.map((r) => ({
        id: r.id,
        receiptNo: r.receipt_no,
        saleId: r.sale_id,
        paymentMethod: r.payment_method,
        amountReceived: r.amount_received,
        previousBalance: r.previous_balance,
        remainingBalance: r.remaining_balance,
        createdAt: r.created_at,
      })),
    },
  });
}

export async function lookupCustomerByCnic(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { cnic } = req.params;

  if (!validateCnic(cnic)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_CNIC', message: 'Invalid 13-digit CNIC format' } });
    return;
  }

  const hash = hashCnic(cnic);
  const customer = queryOne<any>(`SELECT * FROM customers WHERE shop_id = ? AND cnic_hash = ?`, [shopId, hash]);

  if (!customer) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer with this CNIC not found' } });
    return;
  }

  res.json({
    success: true,
    data: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      cnicMasked: customer.cnic_masked,
      email: customer.email,
      address: customer.address,
      creditLimit: customer.credit_limit,
      outstandingBalance: customer.outstanding_balance,
      availableCredit: Math.max(0, customer.credit_limit - customer.outstanding_balance),
    },
  });
}

/**
 * Explicitly authorized endpoint to securely reveal full decrypted CNIC for a customer.
 * Restricted to SHOP_ADMIN via route authorization middleware.
 */
export async function revealCustomerCnic(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { id } = req.params;

  const customer = queryOne<any>(
    `SELECT id, name, cnic_encrypted, cnic_masked, cnic_hash FROM customers WHERE id = ? AND shop_id = ?`,
    [id, shopId]
  );

  if (!customer) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } });
    return;
  }

  if (!customer.cnic_encrypted) {
    res.json({
      success: true,
      data: {
        id: customer.id,
        hasCnic: false,
        cnic: null,
        cnicMasked: null,
      },
    });
    return;
  }

  const decrypted = decryptCnic(customer.cnic_encrypted);
  res.json({
    success: true,
    data: {
      id: customer.id,
      hasCnic: true,
      cnic: decrypted,
      cnicMasked: customer.cnic_masked,
    },
  });
}
