import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { execute, queryAll, queryOne, withTransaction, SqlPrimitive } from '../database/query';
import { getNextInvoiceNumber } from '../utils/sequences';
import { validateCnic, normalizeCnic, maskCnic, hashCnic, encryptCnic } from '../utils/cnic';
import { generateInvoicePdf, InvoicePdfData } from '../utils/pdf-generator';

const checkoutItemSchema = z.object({
  itemType: z.enum(['PHONE', 'ACCESSORY']),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive().default(1),
  actualPrice: z.coerce.number().min(0),
  discountRequestId: z.string().optional().nullable(),
  warrantyMonths: z.coerce.number().int().min(0).default(12),
});

const paymentLineSchema = z.object({
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
  currency: z.string().default('USD'),
  exchangeRate: z.coerce.number().default(1.0),
  transactionReference: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

const checkoutSchema = z.object({
  customerId: z.string().optional().nullable(),
  customerName: z.string().min(1, 'Please enter a customer name for this sale.'),
  customerPhone: z.string().optional().default(''),
  customerCnic: z.string().optional().default(''),
  items: z.array(checkoutItemSchema).min(1, 'At least one item is required in the cart.'),
  payments: z.array(paymentLineSchema).default([]),
  dueDate: z
    .string()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Please provide a valid due date.',
    })
    .optional()
    .nullable(),
  creditOverrideId: z.string().optional().nullable(),
  notes: z.string().optional().default(''),
});

// POS Live Catalog Search
export async function searchPosProducts(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const q = req.query.query ? String(req.query.query).trim() : '';
  const type = req.query.type ? String(req.query.type).toUpperCase() : 'ALL';

  const results: any[] = [];
  const searchParam = `%${q}%`;

  // Search Phones
  if (type === 'ALL' || type === 'PHONE') {
    let phoneSql = `
      SELECT p.*, s.name as supplier_name
      FROM phone_inventory p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.shop_id = ? AND p.status = 'IN_STOCK'
    `;
    const params: SqlPrimitive[] = [shopId];

    if (q) {
      phoneSql += ` AND (p.brand LIKE ? OR p.model LIKE ? OR p.imei1 LIKE ? OR p.imei2 LIKE ? OR p.storage LIKE ?)`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    phoneSql += ` ORDER BY p.brand ASC, p.model ASC LIMIT 40`;
    const phones = queryAll<any>(phoneSql, params);

    for (const ph of phones) {
      results.push({
        id: ph.id,
        itemType: 'PHONE',
        productName: `${ph.brand} ${ph.model}`,
        identifier: ph.imei1,
        imei2: ph.imei2 || null,
        specs: `${ph.ram || ''}GB RAM, ${ph.storage || ''}GB | ${ph.color || ''}`,
        condition: ph.condition,
        stockQuantity: 1,
        defaultPrice: ph.selling_price,
        unitCost: ph.purchase_cost,
        supplierName: ph.supplier_name || 'Direct',
      });
    }
  }

  // Search Accessories
  if (type === 'ALL' || type === 'ACCESSORY') {
    let accSql = `
      SELECT a.*, c.name as category_name
      FROM accessories a
      LEFT JOIN accessory_categories c ON a.category_id = c.id
      WHERE a.shop_id = ? AND a.status = 'ACTIVE' AND a.available_quantity > 0
    `;
    const params: SqlPrimitive[] = [shopId];

    if (q) {
      accSql += ` AND (a.name LIKE ? OR a.sku LIKE ? OR a.barcode LIKE ? OR c.name LIKE ?)`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    accSql += ` ORDER BY a.name ASC LIMIT 40`;
    const accessories = queryAll<any>(accSql, params);

    for (const acc of accessories) {
      results.push({
        id: acc.id,
        itemType: 'ACCESSORY',
        productName: acc.name,
        identifier: acc.sku,
        barcode: acc.barcode || null,
        specs: acc.category_name || 'Accessories',
        condition: 'NEW',
        stockQuantity: acc.available_quantity,
        defaultPrice: acc.selling_price,
        unitCost: acc.purchase_cost || 0,
      });
    }
  }

  res.json({ success: true, data: results });
}

// POS Checkout
export async function checkout(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const userId = req.user!.id;
  const userName = req.user!.name || 'Shop Staff';
  const isShopAdmin = req.user!.role === 'SHOP_ADMIN';

  const parsed = checkoutSchema.safeParse(req.body);
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
        message: firstIssue?.message || 'Checkout validation failed. Please review cart details.',
        fieldErrors,
        details: flattened,
      },
    });
    return;
  }

  const { customerId, customerName, customerPhone, customerCnic, items, payments, dueDate, creditOverrideId, notes } =
    parsed.data;

  // Process checkout atomically in transaction
  try {
    const saleResult = withTransaction((db) => {
      const nowIso = new Date().toISOString();

      // 1. Check if cart has serialized phones
      const hasPhones = items.some((i) => i.itemType === 'PHONE');

      // 2. Fetch or resolve customer
      let resolvedCustomer: any = null;
      let finalCnicEncrypted: string | null = null;
      let finalCnicMasked: string | null = null;

      if (customerId) {
        resolvedCustomer = db.prepare(`SELECT * FROM customers WHERE id = ? AND shop_id = ?`).get(customerId, shopId);
        if (!resolvedCustomer) {
          throw new Error('Customer not found');
        }
        finalCnicEncrypted = resolvedCustomer.cnic_encrypted;
        finalCnicMasked = resolvedCustomer.cnic_masked;
      }

      if (customerCnic && customerCnic.trim().length > 0) {
        if (!validateCnic(customerCnic)) {
          throw new Error('CNIC must be 13 numeric digits');
        }
        const norm = normalizeCnic(customerCnic);
        finalCnicEncrypted = encryptCnic(norm);
        finalCnicMasked = maskCnic(norm);

        // If customer exists, update their CNIC if they didn't have one
        if (resolvedCustomer && !resolvedCustomer.cnic_hash) {
          const hash = hashCnic(norm);
          db.prepare(
            `UPDATE customers SET cnic_encrypted = ?, cnic_masked = ?, cnic_hash = ?, updated_at = ? WHERE id = ?`
          ).run(finalCnicEncrypted, finalCnicMasked, hash, nowIso, resolvedCustomer.id);
        }
      }

      // Mandatory CNIC Rule: Required if selling physical mobile phones
      if (hasPhones && !finalCnicMasked) {
        const err = new Error('CNIC is mandatory for mobile phone sales');
        (err as any).code = 'CNIC_REQUIRED';
        throw err;
      }

      // 3. Tax Settings
      const taxRow = db.prepare(`SELECT * FROM shop_tax_settings WHERE shop_id = ?`).get(shopId) as any;
      const taxEnabled = taxRow ? Boolean(taxRow.tax_enabled) : false;
      const taxRate = taxEnabled && taxRow ? taxRow.tax_rate : 0.0;
      const isTaxInclusive = taxRow ? Boolean(taxRow.is_tax_inclusive) : false;

      // 4. Shop info snapshot
      const shopRow = db.prepare(`SELECT * FROM shops WHERE id = ?`).get(shopId) as any;
      const shopSnapshot = JSON.stringify({
        shopId,
        shopName: shopRow ? shopRow.name : 'Mobile Shop',
        phone: shopRow ? shopRow.phone : '',
        address: shopRow ? shopRow.address : '',
        taxRate,
      });

      // 5. Generate Sequential Invoice Number & Sale ID early for movements and lines
      const invoiceNo = getNextInvoiceNumber(shopId, db);
      const saleId = `sale_${crypto.randomUUID()}`;

      // Process Cart Items, Stock Validation, FIFO Consumption & Profit Calculation
      let totalCost = 0.0;
      let subtotal = 0.0;
      let totalDiscount = 0.0;

      const processedItems: Array<{
        id: string;
        itemType: 'PHONE' | 'ACCESSORY';
        phoneId: string | null;
        accessoryId: string | null;
        productName: string;
        identifier: string | null;
        imei2: string | null;
        specs: string;
        condition: string;
        quantity: number;
        unitCost: number;
        defaultPrice: number;
        actualPrice: number;
        discount: number;
        subtotal: number;
        profit: number;
        fifoAllocations: string | null;
        warrantyMonths: number;
      }> = [];

      for (const item of items) {
        if (item.itemType === 'PHONE') {
          // Revalidate stock atomically
          const phone = db.prepare(`SELECT * FROM phone_inventory WHERE id = ? AND shop_id = ?`).get(item.productId, shopId) as any;
          if (!phone) {
            throw new Error(`Phone with ID ${item.productId} not found`);
          }
          if (phone.status !== 'IN_STOCK') {
            const err = new Error(`Phone ${phone.brand} ${phone.model} (IMEI: ${phone.imei1}) is no longer in stock (Status: ${phone.status})`);
            (err as any).code = 'PHONE_NOT_IN_STOCK';
            throw err;
          }

          const defaultPrice = phone.selling_price;
          const actualPrice = item.actualPrice;

          // Discount verification
          if (actualPrice < defaultPrice && !isShopAdmin) {
            if (!item.discountRequestId) {
              const err = new Error(`Selling below default price ($${defaultPrice}) requires manager discount approval`);
              (err as any).code = 'DISCOUNT_APPROVAL_REQUIRED';
              throw err;
            }
            const discReq = db.prepare(`SELECT * FROM discount_requests WHERE id = ? AND shop_id = ?`).get(item.discountRequestId, shopId) as any;
            if (!discReq || discReq.status !== 'APPROVED') {
              const err = new Error(`Discount request is not approved`);
              (err as any).code = 'DISCOUNT_NOT_APPROVED';
              throw err;
            }
            // Mark discount request as APPLIED
            db.prepare(`UPDATE discount_requests SET status = 'APPLIED' WHERE id = ?`).run(item.discountRequestId);
          }

          const discountPerUnit = Math.max(0, defaultPrice - actualPrice);
          const itemSubtotal = actualPrice;
          const itemCost = phone.purchase_cost;
          const itemProfit = actualPrice - itemCost;

          subtotal += itemSubtotal;
          totalCost += itemCost;
          totalDiscount += discountPerUnit;

          // Mark phone as SOLD
          db.prepare(`UPDATE phone_inventory SET status = 'SOLD', updated_at = ? WHERE id = ?`).run(nowIso, phone.id);

          // Log stock movement
          db.prepare(`
            INSERT INTO stock_movements (
              id, shop_id, item_type, product_id, product_name, identifier, movement_type,
              reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
            ) VALUES (?, ?, 'PHONE', ?, ?, ?, 'ADJUSTMENT', ?, -1, ?, ?, ?, ?)
          `).run(
            `smov_${crypto.randomUUID()}`,
            shopId,
            phone.id,
            `${phone.brand} ${phone.model}`,
            phone.imei1,
            invoiceNo,
            itemCost,
            'POS Sale',
            userId,
            nowIso
          );

          processedItems.push({
            id: `sitem_${crypto.randomUUID()}`,
            itemType: 'PHONE',
            phoneId: phone.id,
            accessoryId: null,
            productName: `${phone.brand} ${phone.model}`,
            identifier: phone.imei1,
            imei2: phone.imei2 || null,
            specs: `${phone.ram || ''}GB / ${phone.storage || ''}GB ${phone.color || ''}`,
            condition: phone.condition,
            quantity: 1,
            unitCost: itemCost,
            defaultPrice,
            actualPrice,
            discount: discountPerUnit,
            subtotal: itemSubtotal,
            profit: itemProfit,
            fifoAllocations: null,
            warrantyMonths: item.warrantyMonths || 12,
          });
        } else {
          // Accessory
          const accessory = db.prepare(`SELECT * FROM accessories WHERE id = ? AND shop_id = ?`).get(item.productId, shopId) as any;
          if (!accessory) {
            throw new Error(`Accessory with ID ${item.productId} not found`);
          }
          if (accessory.available_quantity < item.quantity) {
            const err = new Error("There isn't enough stock available for this sale.");
            (err as any).code = 'INSUFFICIENT_STOCK';
            (err as any).details = {
              item: accessory.name,
              available: accessory.available_quantity,
              requested: item.quantity,
            };
            throw err;
          }

          const defaultPrice = accessory.selling_price;
          const actualPrice = item.actualPrice;

          // Discount verification
          if (actualPrice < defaultPrice && !isShopAdmin) {
            if (!item.discountRequestId) {
              const err = new Error(`Selling below default price ($${defaultPrice}) requires manager discount approval`);
              (err as any).code = 'DISCOUNT_APPROVAL_REQUIRED';
              throw err;
            }
            const discReq = db.prepare(`SELECT * FROM discount_requests WHERE id = ? AND shop_id = ?`).get(item.discountRequestId, shopId) as any;
            if (!discReq || discReq.status !== 'APPROVED') {
              const err = new Error(`Discount request is not approved`);
              (err as any).code = 'DISCOUNT_NOT_APPROVED';
              throw err;
            }
            db.prepare(`UPDATE discount_requests SET status = 'APPLIED' WHERE id = ?`).run(item.discountRequestId);
          }

          // Consume FIFO batches
          const batches = db.prepare(`
            SELECT * FROM accessory_batches
            WHERE accessory_id = ? AND remaining_quantity > 0
            ORDER BY purchase_date ASC, created_at ASC
          `).all(accessory.id) as any[];

          let qtyNeeded = item.quantity;
          let itemCostSum = 0.0;
          const allocations: Array<{ batchId: string; quantity: number; unitCost: number }> = [];

          for (const b of batches) {
            if (qtyNeeded <= 0) break;
            const take = Math.min(qtyNeeded, b.remaining_quantity);
            const remaining = b.remaining_quantity - take;
            db.prepare(`UPDATE accessory_batches SET remaining_quantity = ? WHERE id = ?`).run(remaining, b.id);

            allocations.push({
              batchId: b.id,
              quantity: take,
              unitCost: b.unit_cost,
            });
            itemCostSum += take * b.unit_cost;
            qtyNeeded -= take;
          }

          if (qtyNeeded > 0) {
            // Fallback to purchase cost if batch records were somehow short
            itemCostSum += qtyNeeded * (accessory.purchase_cost || 0);
          }

          const unitCost = itemCostSum / item.quantity;
          const lineSubtotal = actualPrice * item.quantity;
          const lineProfit = lineSubtotal - itemCostSum;
          const discountPerUnit = Math.max(0, defaultPrice - actualPrice);

          subtotal += lineSubtotal;
          totalCost += itemCostSum;
          totalDiscount += discountPerUnit * item.quantity;

          // Update accessory stock quantity
          db.prepare(`UPDATE accessories SET available_quantity = available_quantity - ?, updated_at = ? WHERE id = ?`).run(
            item.quantity,
            nowIso,
            accessory.id
          );

          // Log stock movement
          db.prepare(`
            INSERT INTO stock_movements (
              id, shop_id, item_type, product_id, product_name, identifier, movement_type,
              reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
            ) VALUES (?, ?, 'ACCESSORY', ?, ?, ?, 'ADJUSTMENT', ?, ?, ?, ?, ?, ?)
          `).run(
            `smov_${crypto.randomUUID()}`,
            shopId,
            accessory.id,
            accessory.name,
            accessory.sku,
            invoiceNo,
            -item.quantity,
            unitCost,
            'POS Sale',
            userId,
            nowIso
          );

          processedItems.push({
            id: `sitem_${crypto.randomUUID()}`,
            itemType: 'ACCESSORY',
            phoneId: null,
            accessoryId: accessory.id,
            productName: accessory.name,
            identifier: accessory.sku,
            imei2: null,
            specs: 'Standard Accessory',
            condition: 'NEW',
            quantity: item.quantity,
            unitCost,
            defaultPrice,
            actualPrice,
            discount: discountPerUnit,
            subtotal: lineSubtotal,
            profit: lineProfit,
            fifoAllocations: JSON.stringify(allocations),
            warrantyMonths: item.warrantyMonths || 0,
          });
        }
      }

      // 6. Taxes and Totals Calculation
      let taxAmount = 0.0;
      let totalAmount = subtotal;

      if (taxEnabled && taxRate > 0) {
        if (isTaxInclusive) {
          taxAmount = subtotal - subtotal / (1 + taxRate / 100);
          totalAmount = subtotal;
        } else {
          taxAmount = subtotal * (taxRate / 100);
          totalAmount = subtotal + taxAmount;
        }
      }

      // 7. Payments & Credit Balance
      let amountPaid = 0.0;
      for (const p of payments) {
        amountPaid += p.amount;
      }

      const balanceDue = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);

      let paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' = 'PAID';
      if (amountPaid <= 0) {
        paymentStatus = 'UNPAID';
      } else if (balanceDue > 0) {
        paymentStatus = 'PARTIALLY_PAID';
      }

      // 8. Credit Limit Verification
      if (balanceDue > 0) {
        if (!resolvedCustomer) {
          const err = new Error('A registered customer is required for credit / unpaid sales');
          (err as any).code = 'CUSTOMER_REQUIRED_FOR_CREDIT';
          throw err;
        }

        const availableCredit = resolvedCustomer.credit_limit - resolvedCustomer.outstanding_balance;
        if (balanceDue > availableCredit && !isShopAdmin) {
          // Check if an approved credit override is provided
          let overrideApproved = false;
          if (creditOverrideId) {
            const ovr = db.prepare(`SELECT * FROM credit_limit_overrides WHERE id = ? AND shop_id = ?`).get(creditOverrideId, shopId) as any;
            if (ovr && ovr.status === 'APPROVED') {
              overrideApproved = true;
              db.prepare(`UPDATE credit_limit_overrides SET status = 'USED' WHERE id = ?`).run(creditOverrideId);
            }
          }

          if (!overrideApproved) {
            const err = new Error(
              `Sale exceeds customer credit limit! Available credit: $${availableCredit.toFixed(2)}, Balance due: $${balanceDue.toFixed(2)}`
            );
            (err as any).code = 'CREDIT_LIMIT_EXCEEDED';
            throw err;
          }
        }

        // Increase customer outstanding balance
        db.prepare(`UPDATE customers SET outstanding_balance = outstanding_balance + ?, updated_at = ? WHERE id = ?`).run(
          balanceDue,
          nowIso,
          resolvedCustomer.id
        );
      }

      // 9. Profit Calculation
      const grossProfit = subtotal - totalCost;

      // 10. Insert Sale Record
      db.prepare(`
        INSERT INTO sales (
          id, shop_id, invoice_no, customer_id, customer_name, customer_phone, customer_cnic_encrypted,
          customer_cnic_masked, subtotal, discount_amount, tax_rate, tax_amount, total_amount,
          amount_paid, balance_due, total_cost, gross_profit, payment_status, due_date,
          shopkeeper_id, shopkeeper_name, shop_snapshot, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId,
        shopId,
        invoiceNo,
        resolvedCustomer ? resolvedCustomer.id : null,
        customerName,
        customerPhone || (resolvedCustomer ? resolvedCustomer.phone : null),
        finalCnicEncrypted,
        finalCnicMasked,
        subtotal,
        totalDiscount,
        taxRate,
        taxAmount,
        totalAmount,
        amountPaid,
        balanceDue,
        totalCost,
        grossProfit,
        paymentStatus,
        dueDate || null,
        userId,
        userName,
        shopSnapshot,
        notes || '',
        nowIso
      );

      // 11. Insert Line Items
      const insertItemStmt = db.prepare(`
        INSERT INTO sale_items (
          id, sale_id, shop_id, item_type, phone_id, accessory_id, product_name, identifier,
          imei2, specs, condition, quantity, unit_cost, default_price, actual_price,
          discount, subtotal, profit, fifo_batch_allocations, warranty_months, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of processedItems) {
        insertItemStmt.run(
          item.id,
          saleId,
          shopId,
          item.itemType,
          item.phoneId,
          item.accessoryId,
          item.productName,
          item.identifier,
          item.imei2,
          item.specs,
          item.condition,
          item.quantity,
          item.unitCost,
          item.defaultPrice,
          item.actualPrice,
          item.discount,
          item.subtotal,
          item.profit,
          item.fifoAllocations,
          item.warrantyMonths,
          nowIso
        );

        // If phone or warranty applies, insert warranty record
        if (item.warrantyMonths > 0) {
          const endDate = new Date(Date.now() + item.warrantyMonths * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          db.prepare(`
            INSERT INTO warranty_records (
              id, shop_id, sale_id, sale_item_id, customer_id, item_type, product_id, product_name,
              identifier, warranty_type, provider_name, duration_months, start_date, end_date, terms, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SHOP', ?, ?, ?, ?, 'Standard warranty against manufacturing defects', 'ACTIVE', ?)
          `).run(
            `warr_${crypto.randomUUID()}`,
            shopId,
            saleId,
            item.id,
            resolvedCustomer ? resolvedCustomer.id : null,
            item.itemType,
            item.phoneId || item.accessoryId || '',
            item.productName,
            item.identifier,
            shopRow ? shopRow.name : 'Shop Warranty',
            item.warrantyMonths,
            nowIso.slice(0, 10),
            endDate,
            nowIso
          );
        }
      }

      // 12. Insert Payment Entries
      const insertPaymentStmt = db.prepare(`
        INSERT INTO sale_payments (
          id, sale_id, shop_id, payment_method, amount, currency, exchange_rate,
          transaction_reference, notes, recorded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const pay of payments) {
        insertPaymentStmt.run(
          `spay_${crypto.randomUUID()}`,
          saleId,
          shopId,
          pay.paymentMethod,
          pay.amount,
          pay.currency || 'USD',
          pay.exchangeRate || 1.0,
          pay.transactionReference || '',
          pay.notes || '',
          userId,
          nowIso
        );
      }

      return {
        id: saleId,
        invoiceNo,
        customerName,
        customerPhone,
        customerCnicMasked: finalCnicMasked,
        subtotal,
        discountAmount: totalDiscount,
        taxAmount,
        taxRate,
        totalAmount,
        amountPaid,
        balanceDue,
        paymentStatus,
        grossProfit,
        createdAt: nowIso,
        itemsCount: processedItems.length,
      };
    });

    res.status(201).json({
      success: true,
      data: saleResult,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: {
        code: err.code || 'CHECKOUT_FAILED',
        message: err.message || 'Error processing POS checkout',
      },
    });
  }
}

// List Sales
export async function listSales(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const search = req.query.search ? String(req.query.search).trim() : '';
  const status = req.query.status ? String(req.query.status) : '';
  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : '';
  const dateTo = req.query.dateTo ? String(req.query.dateTo) : '';

  let sql = `SELECT * FROM sales WHERE shop_id = ?`;
  const params: SqlPrimitive[] = [shopId];

  if (status) {
    sql += ` AND payment_status = ?`;
    params.push(status);
  }

  if (dateFrom) {
    sql += ` AND date(created_at) >= date(?)`;
    params.push(dateFrom);
  }

  if (dateTo) {
    sql += ` AND date(created_at) <= date(?)`;
    params.push(dateTo);
  }

  if (search) {
    sql += ` AND (invoice_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  sql += ` ORDER BY created_at DESC LIMIT 100`;

  const rows = queryAll<any>(sql, params);
  res.json({
    success: true,
    data: rows.map((s) => ({
      id: s.id,
      invoiceNo: s.invoice_no,
      customerId: s.customer_id,
      customerName: s.customer_name,
      customerPhone: s.customer_phone,
      customerCnicMasked: s.customer_cnic_masked,
      subtotal: s.subtotal,
      discountAmount: s.discount_amount,
      taxAmount: s.tax_amount,
      taxRate: s.tax_rate,
      totalAmount: s.total_amount,
      amountPaid: s.amount_paid,
      balanceDue: s.balance_due,
      grossProfit: s.gross_profit,
      paymentStatus: s.payment_status,
      dueDate: s.due_date,
      shopkeeperName: s.shopkeeper_name,
      isReversed: Boolean(s.is_reversed),
      createdAt: s.created_at,
    })),
  });
}

// Get Single Sale Details with Line Items & Payments
export async function getSaleById(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { id } = req.params;

  const sale = queryOne<any>(`SELECT * FROM sales WHERE id = ? AND shop_id = ?`, [id, shopId]);
  if (!sale) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sale not found' } });
    return;
  }

  const items = queryAll<any>(`SELECT * FROM sale_items WHERE sale_id = ? ORDER BY created_at ASC`, [id]);
  const payments = queryAll<any>(`SELECT * FROM sale_payments WHERE sale_id = ? ORDER BY created_at ASC`, [id]);
  const receipts = queryAll<any>(`SELECT * FROM customer_payment_receipts WHERE sale_id = ? ORDER BY created_at ASC`, [id]);
  const warranties = queryAll<any>(`SELECT * FROM warranty_records WHERE sale_id = ?`, [id]);

  res.json({
    success: true,
    data: {
      sale: {
        id: sale.id,
        invoiceNo: sale.invoice_no,
        customerId: sale.customer_id,
        customerName: sale.customer_name,
        customerPhone: sale.customer_phone,
        customerCnicMasked: sale.customer_cnic_masked,
        subtotal: sale.subtotal,
        discountAmount: sale.discount_amount,
        taxAmount: sale.tax_amount,
        taxRate: sale.tax_rate,
        totalAmount: sale.total_amount,
        amountPaid: sale.amount_paid,
        balanceDue: sale.balance_due,
        grossProfit: sale.gross_profit,
        paymentStatus: sale.payment_status,
        dueDate: sale.due_date,
        shopkeeperName: sale.shopkeeper_name,
        notes: sale.notes,
        isReversed: Boolean(sale.is_reversed),
        createdAt: sale.created_at,
      },
      items: items.map((i) => ({
        id: i.id,
        itemType: i.item_type,
        phoneId: i.phone_id,
        accessoryId: i.accessory_id,
        productName: i.product_name,
        identifier: i.identifier,
        imei2: i.imei2,
        specs: i.specs,
        condition: i.condition,
        quantity: i.quantity,
        unitCost: i.unit_cost,
        defaultPrice: i.default_price,
        actualPrice: i.actual_price,
        discount: i.discount,
        subtotal: i.subtotal,
        profit: i.profit,
        warrantyMonths: i.warranty_months,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        paymentMethod: p.payment_method,
        amount: p.amount,
        currency: p.currency,
        exchangeRate: p.exchange_rate,
        transactionReference: p.transaction_reference,
        notes: p.notes,
        createdAt: p.created_at,
      })),
      receipts: receipts.map((r) => ({
        id: r.id,
        receiptNo: r.receipt_no,
        paymentMethod: r.payment_method,
        amountReceived: r.amount_received,
        remainingBalance: r.remaining_balance,
        createdAt: r.created_at,
      })),
      warranties: warranties.map((w) => ({
        id: w.id,
        productName: w.product_name,
        identifier: w.identifier,
        warrantyType: w.warranty_type,
        providerName: w.provider_name,
        durationMonths: w.duration_months,
        startDate: w.start_date,
        endDate: w.end_date,
        status: w.status,
      })),
    },
  });
}

// Download Invoice PDF
export async function downloadInvoicePdf(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { id } = req.params;

  const sale = queryOne<any>(`SELECT * FROM sales WHERE id = ? AND shop_id = ?`, [id, shopId]);
  if (!sale) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
    return;
  }

  const items = queryAll<any>(`SELECT * FROM sale_items WHERE sale_id = ?`, [id]);
  const shop = queryOne<any>(`SELECT * FROM shops WHERE id = ?`, [shopId]);

  const pdfData: InvoicePdfData = {
    shopName: shop ? shop.name : 'Mobile Shop',
    shopAddress: shop ? shop.address : undefined,
    shopPhone: shop ? shop.phone : undefined,
    invoiceNo: sale.invoice_no,
    date: sale.created_at.slice(0, 10),
    customerName: sale.customer_name,
    customerPhone: sale.customer_phone || undefined,
    customerCnicMasked: sale.customer_cnic_masked || undefined,
    paymentStatus: sale.payment_status,
    items: items.map((i) => ({
      productName: i.product_name,
      identifier: i.identifier,
      quantity: i.quantity,
      actualPrice: i.actual_price,
      subtotal: i.subtotal,
    })),
    subtotal: sale.subtotal,
    discountAmount: sale.discount_amount,
    taxAmount: sale.tax_amount,
    taxRate: sale.tax_rate,
    totalAmount: sale.total_amount,
    amountPaid: sale.amount_paid,
    balanceDue: sale.balance_due,
    shopkeeperName: sale.shopkeeper_name,
    notes: sale.notes || undefined,
  };

  const buffer = generateInvoicePdf(pdfData);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${sale.invoice_no}.pdf"`);
  res.send(buffer);
}

// Reverse / Cancel Sale (Admin Only)
export async function reverseSale(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const userId = req.user!.id;
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim().length < 3) {
    res.status(400).json({
      success: false,
      error: { code: 'REASON_REQUIRED', message: 'A descriptive reason is required to reverse a sale transaction' },
    });
    return;
  }

  try {
    withTransaction((db) => {
      const sale = db.prepare(`SELECT * FROM sales WHERE id = ? AND shop_id = ?`).get(id, shopId) as any;
      if (!sale) {
        throw new Error('Sale transaction not found');
      }
      if (sale.is_reversed) {
        throw new Error('This sale has already been reversed');
      }

      const nowIso = new Date().toISOString();
      const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(id) as any[];

      // Restore phones and accessories
      for (const item of items) {
        if (item.item_type === 'PHONE' && item.phone_id) {
          db.prepare(`UPDATE phone_inventory SET status = 'IN_STOCK', updated_at = ? WHERE id = ?`).run(nowIso, item.phone_id);
          db.prepare(`
            INSERT INTO stock_movements (
              id, shop_id, item_type, product_id, product_name, identifier, movement_type,
              reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
            ) VALUES (?, ?, 'PHONE', ?, ?, ?, 'ADJUSTMENT', ?, 1, ?, ?, ?, ?)
          `).run(
            `smov_${crypto.randomUUID()}`,
            shopId,
            item.phone_id,
            item.product_name,
            item.identifier,
            sale.invoice_no,
            item.unit_cost,
            `Reversal of ${sale.invoice_no}`,
            userId,
            nowIso
          );
        } else if (item.item_type === 'ACCESSORY' && item.accessory_id) {
          // Restore stock quantity
          db.prepare(`UPDATE accessories SET available_quantity = available_quantity + ?, updated_at = ? WHERE id = ?`).run(
            item.quantity,
            nowIso,
            item.accessory_id
          );

          // Restore FIFO batches if allocated
          if (item.fifo_batch_allocations) {
            try {
              const allocations = JSON.parse(item.fifo_batch_allocations);
              for (const alloc of allocations) {
                db.prepare(`UPDATE accessory_batches SET remaining_quantity = remaining_quantity + ? WHERE id = ?`).run(
                  alloc.quantity,
                  alloc.batchId
                );
              }
            } catch {
              // fallback
            }
          }

          db.prepare(`
            INSERT INTO stock_movements (
              id, shop_id, item_type, product_id, product_name, identifier, movement_type,
              reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
            ) VALUES (?, ?, 'ACCESSORY', ?, ?, ?, 'ADJUSTMENT', ?, ?, ?, ?, ?, ?)
          `).run(
            `smov_${crypto.randomUUID()}`,
            shopId,
            item.accessory_id,
            item.product_name,
            item.identifier,
            sale.invoice_no,
            item.quantity,
            item.unit_cost,
            `Reversal of ${sale.invoice_no}`,
            userId,
            nowIso
          );
        }
      }

      // If customer had balance due on this sale, subtract it from customer outstanding balance
      if (sale.customer_id && sale.balance_due > 0) {
        db.prepare(
          `UPDATE customers SET outstanding_balance = MAX(0.0, outstanding_balance - ?), updated_at = ? WHERE id = ?`
        ).run(sale.balance_due, nowIso, sale.customer_id);
      }

      // Void warranty records
      db.prepare(`UPDATE warranty_records SET status = 'VOID' WHERE sale_id = ?`).run(id);

      // Mark sale as reversed
      db.prepare(`
        UPDATE sales SET
          is_reversed = 1, reversed_at = ?, reversed_by = ?, reversal_reason = ?
        WHERE id = ?
      `).run(nowIso, userId, reason, id);
    });

    res.json({ success: true, message: 'Sale successfully reversed and inventory restored' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'REVERSAL_FAILED', message: err.message } });
  }
}
