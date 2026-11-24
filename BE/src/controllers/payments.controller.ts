import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { queryAll, queryOne, withTransaction, SqlPrimitive } from '../database/query';
import { getNextReceiptNumber } from '../utils/sequences';
import { generateReceiptPdf, ReceiptPdfData } from '../utils/pdf-generator';

const recordPaymentSchema = z.object({
  paymentMethod: z.enum([
    'CASH',
    'BANK_TRANSFER',
    'CARD',
    'JAZZCASH',
    'EASYPAISA',
    'CRYPTO_BTC',
    'CRYPTO_USDT',
    'CRYPTO_ETH',
    'CUSTOM',
  ]),
  amount: z.coerce.number().positive(),
  transactionReference: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

export async function recordSalePayment(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const userId = req.user!.id;
  const userName = req.user!.name || 'Shop Staff';
  const { id: saleId } = req.params;

  const parsed = recordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Payment validation failed', details: parsed.error.flatten() },
    });
    return;
  }

  const { paymentMethod, amount, transactionReference, notes } = parsed.data;

  try {
    const result = withTransaction((db) => {
      const sale = db.prepare(`SELECT * FROM sales WHERE id = ? AND shop_id = ?`).get(saleId, shopId) as any;
      if (!sale) {
        throw new Error('Sale invoice not found');
      }

      if (sale.is_reversed) {
        throw new Error('Cannot apply payment to a reversed sale invoice');
      }

      if (sale.balance_due <= 0) {
        throw new Error('This invoice is already fully paid');
      }

      if (amount > sale.balance_due) {
        throw new Error(`Payment amount ($${amount}) exceeds remaining balance due ($${sale.balance_due})`);
      }

      const nowIso = new Date().toISOString();
      const previousBalance = sale.balance_due;
      const remainingBalance = Math.round((previousBalance - amount) * 100) / 100;
      const newAmountPaid = Math.round((sale.amount_paid + amount) * 100) / 100;

      const newPaymentStatus = remainingBalance <= 0 ? 'PAID' : 'PARTIALLY_PAID';

      // Update sale
      db.prepare(`
        UPDATE sales SET
          amount_paid = ?, balance_due = ?, payment_status = ?
        WHERE id = ?
      `).run(newAmountPaid, remainingBalance, newPaymentStatus, saleId);

      // Also record into sale_payments for audit history
      db.prepare(`
        INSERT INTO sale_payments (
          id, sale_id, shop_id, payment_method, amount, currency, exchange_rate,
          transaction_reference, notes, recorded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, 'USD', 1.0, ?, ?, ?, ?)
      `).run(`spay_${crypto.randomUUID()}`, saleId, shopId, paymentMethod, amount, transactionReference, notes, userId, nowIso);

      // Update customer balance if customer linked
      if (sale.customer_id) {
        db.prepare(`
          UPDATE customers SET
            outstanding_balance = MAX(0.0, outstanding_balance - ?),
            updated_at = ?
          WHERE id = ?
        `).run(amount, nowIso, sale.customer_id);
      }

      // Generate next sequential receipt number
      const receiptNo = getNextReceiptNumber(shopId, db);
      const receiptId = `rec_${crypto.randomUUID()}`;

      // Insert customer payment receipt
      db.prepare(`
        INSERT INTO customer_payment_receipts (
          id, shop_id, receipt_no, sale_id, customer_id, payment_method,
          amount_received, previous_balance, remaining_balance, transaction_reference,
          notes, received_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        receiptId,
        shopId,
        receiptNo,
        saleId,
        sale.customer_id || 'cust_anonymous',
        paymentMethod,
        amount,
        previousBalance,
        remainingBalance,
        transactionReference,
        notes,
        userId,
        nowIso
      );

      return {
        id: receiptId,
        receiptNo,
        saleId,
        invoiceNo: sale.invoice_no,
        customerName: sale.customer_name,
        paymentMethod,
        amountReceived: amount,
        previousBalance,
        remainingBalance,
        paymentStatus: newPaymentStatus,
        receivedByName: userName,
        createdAt: nowIso,
      };
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'PAYMENT_FAILED', message: err.message } });
  }
}

export async function listReceipts(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const search = req.query.search ? String(req.query.search).trim() : '';

  let sql = `
    SELECT r.*, s.invoice_no, c.name as customer_name, u.name as received_by_name
    FROM customer_payment_receipts r
    LEFT JOIN sales s ON r.sale_id = s.id
    LEFT JOIN customers c ON r.customer_id = c.id
    LEFT JOIN users u ON r.received_by = u.id
    WHERE r.shop_id = ?
  `;
  const params: SqlPrimitive[] = [shopId];

  if (search) {
    sql += ` AND (r.receipt_no LIKE ? OR s.invoice_no LIKE ? OR c.name LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  sql += ` ORDER BY r.created_at DESC LIMIT 100`;

  const rows = queryAll<any>(sql, params);
  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      receiptNo: r.receipt_no,
      saleId: r.sale_id,
      invoiceNo: r.invoice_no,
      customerId: r.customer_id,
      customerName: r.customer_name || 'Walk-in Customer',
      paymentMethod: r.payment_method,
      amountReceived: r.amount_received,
      previousBalance: r.previous_balance,
      remainingBalance: r.remaining_balance,
      transactionReference: r.transaction_reference,
      receivedByName: r.received_by_name || 'Staff',
      notes: r.notes,
      createdAt: r.created_at,
    })),
  });
}

export async function getReceiptById(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { id } = req.params;

  const receipt = queryOne<any>(
    `SELECT r.*, s.invoice_no, c.name as customer_name, u.name as received_by_name
     FROM customer_payment_receipts r
     LEFT JOIN sales s ON r.sale_id = s.id
     LEFT JOIN customers c ON r.customer_id = c.id
     LEFT JOIN users u ON r.received_by = u.id
     WHERE r.id = ? AND r.shop_id = ?`,
    [id, shopId]
  );

  if (!receipt) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment receipt not found' } });
    return;
  }

  res.json({
    success: true,
    data: {
      id: receipt.id,
      receiptNo: receipt.receipt_no,
      saleId: receipt.sale_id,
      invoiceNo: receipt.invoice_no,
      customerName: receipt.customer_name || 'Customer',
      paymentMethod: receipt.payment_method,
      amountReceived: receipt.amount_received,
      previousBalance: receipt.previous_balance,
      remainingBalance: receipt.remaining_balance,
      transactionReference: receipt.transaction_reference,
      receivedByName: receipt.received_by_name || 'Staff',
      notes: receipt.notes,
      createdAt: receipt.created_at,
    },
  });
}

export async function downloadReceiptPdf(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { id } = req.params;

  const receipt = queryOne<any>(
    `SELECT r.*, s.invoice_no, c.name as customer_name, u.name as received_by_name
     FROM customer_payment_receipts r
     LEFT JOIN sales s ON r.sale_id = s.id
     LEFT JOIN customers c ON r.customer_id = c.id
     LEFT JOIN users u ON r.received_by = u.id
     WHERE r.id = ? AND r.shop_id = ?`,
    [id, shopId]
  );

  if (!receipt) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Receipt not found' } });
    return;
  }

  const shop = queryOne<any>(`SELECT name FROM shops WHERE id = ?`, [shopId]);

  const pdfData: ReceiptPdfData = {
    shopName: shop ? shop.name : 'Mobile Shop',
    receiptNo: receipt.receipt_no,
    invoiceNo: receipt.invoice_no || 'N/A',
    date: receipt.created_at.slice(0, 10),
    customerName: receipt.customer_name || 'Customer',
    paymentMethod: receipt.payment_method,
    amountReceived: receipt.amount_received,
    previousBalance: receipt.previous_balance,
    remainingBalance: receipt.remaining_balance,
    receivedByName: receipt.received_by_name || 'Cashier',
    notes: receipt.notes || undefined,
  };

  const buffer = generateReceiptPdf(pdfData);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${receipt.receipt_no}.pdf"`);
  res.send(buffer);
}
