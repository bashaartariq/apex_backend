import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { queryAll, queryOne, withTransaction } from '../database/query';
import { getNextReturnNumber, getNextInvoiceNumber } from '../utils/sequences';

const returnItemSchema = z.object({
  saleItemId: z.string().min(1),
  quantity: z.coerce.number().int().positive().default(1),
  unitRefundAmount: z.coerce.number().min(0),
  restoreToInventory: z.boolean().default(true),
});

const createReturnSchema = z.object({
  saleId: z.string().min(1),
  returnType: z.enum(['REFUND', 'EXCHANGE']).default('REFUND'),
  reason: z.string().min(3, 'Return reason is required'),
  items: z.array(returnItemSchema).min(1, 'At least one item must be returned'),
});

const exchangeSchema = z.object({
  returnPayload: createReturnSchema,
  replacementItems: z.array(
    z.object({
      itemType: z.enum(['PHONE', 'ACCESSORY']),
      productId: z.string().min(1),
      quantity: z.coerce.number().int().positive().default(1),
      actualPrice: z.coerce.number().min(0),
    })
  ).min(1, 'At least one replacement product is required for an exchange'),
  paymentMethod: z.string().optional().default('CASH'),
});

export async function processReturn(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const userId = req.user!.id;

  const parsed = createReturnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Return validation failed', details: parsed.error.flatten() },
    });
    return;
  }

  const { saleId, returnType, reason, items } = parsed.data;

  try {
    const result = withTransaction((db) => {
      const sale = db.prepare(`SELECT * FROM sales WHERE id = ? AND shop_id = ?`).get(saleId, shopId) as any;
      if (!sale) {
        throw new Error('Sale invoice not found');
      }
      if (sale.is_reversed) {
        throw new Error('Cannot return items from a reversed sale');
      }

      const nowIso = new Date().toISOString();
      const returnNo = getNextReturnNumber(shopId, db);
      const returnId = `ret_${crypto.randomUUID()}`;

      let totalRefundAmount = 0.0;
      const processedReturnItems: any[] = [];

      for (const item of items) {
        const saleItem = db.prepare(`SELECT * FROM sale_items WHERE id = ? AND sale_id = ?`).get(item.saleItemId, saleId) as any;
        if (!saleItem) {
          throw new Error(`Sale item ${item.saleItemId} not found on this invoice`);
        }

        const refundAmt = item.unitRefundAmount * item.quantity;
        totalRefundAmount += refundAmt;

        // Restore inventory if requested
        if (item.restoreToInventory) {
          if (saleItem.item_type === 'PHONE' && saleItem.phone_id) {
            db.prepare(`UPDATE phone_inventory SET status = 'IN_STOCK', updated_at = ? WHERE id = ?`).run(nowIso, saleItem.phone_id);
            db.prepare(`
              INSERT INTO stock_movements (
                id, shop_id, item_type, product_id, product_name, identifier, movement_type,
                reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
              ) VALUES (?, ?, 'PHONE', ?, ?, ?, 'ADJUSTMENT', ?, 1, ?, ?, ?, ?)
            `).run(
              `smov_${crypto.randomUUID()}`,
              shopId,
              saleItem.phone_id,
              saleItem.product_name,
              saleItem.identifier,
              returnNo,
              saleItem.unit_cost,
              `Return: ${returnNo} (${reason})`,
              userId,
              nowIso
            );
          } else if (saleItem.item_type === 'ACCESSORY' && saleItem.accessory_id) {
            db.prepare(`UPDATE accessories SET available_quantity = available_quantity + ?, updated_at = ? WHERE id = ?`).run(
              item.quantity,
              nowIso,
              saleItem.accessory_id
            );

            // Restore FIFO batch remaining quantities
            if (saleItem.fifo_batch_allocations) {
              try {
                const allocations = JSON.parse(saleItem.fifo_batch_allocations);
                for (const alloc of allocations) {
                  db.prepare(`UPDATE accessory_batches SET remaining_quantity = remaining_quantity + ? WHERE id = ?`).run(
                    alloc.quantity,
                    alloc.batchId
                  );
                }
              } catch {
                // ignore
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
              saleItem.accessory_id,
              saleItem.product_name,
              saleItem.identifier,
              returnNo,
              item.quantity,
              saleItem.unit_cost,
              `Return: ${returnNo} (${reason})`,
              userId,
              nowIso
            );
          }
        }

        // Void warranty for returned phone
        if (saleItem.phone_id) {
          db.prepare(`UPDATE warranty_records SET status = 'VOID' WHERE sale_item_id = ?`).run(saleItem.id);
        }

        processedReturnItems.push({
          id: `ritem_${crypto.randomUUID()}`,
          returnId,
          shopId,
          saleItemId: saleItem.id,
          itemType: saleItem.item_type,
          phoneId: saleItem.phone_id,
          accessoryId: saleItem.accessory_id,
          productName: saleItem.product_name,
          identifier: saleItem.identifier,
          quantity: item.quantity,
          unitRefundAmount: item.unitRefundAmount,
          restoredCost: saleItem.unit_cost,
          restoredToInventory: item.restoreToInventory ? 1 : 0,
        });
      }

      // If customer had outstanding balance, reduce it
      if (sale.customer_id && sale.balance_due > 0) {
        const creditDeduction = Math.min(sale.balance_due, totalRefundAmount);
        db.prepare(`UPDATE sales SET balance_due = balance_due - ? WHERE id = ?`).run(creditDeduction, sale.id);
        db.prepare(
          `UPDATE customers SET outstanding_balance = MAX(0.0, outstanding_balance - ?), updated_at = ? WHERE id = ?`
        ).run(creditDeduction, nowIso, sale.customer_id);
      }

      // Insert return record
      db.prepare(`
        INSERT INTO returns (id, shop_id, return_no, sale_id, customer_id, return_type, total_refund_amount, reason, processed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        returnId,
        shopId,
        returnNo,
        saleId,
        sale.customer_id,
        returnType,
        totalRefundAmount,
        reason,
        userId,
        nowIso
      );

      // Insert return items
      const insertReturnItemStmt = db.prepare(`
        INSERT INTO return_items (
          id, return_id, shop_id, sale_item_id, item_type, phone_id, accessory_id,
          product_name, identifier, quantity, unit_refund_amount, restored_cost, restored_to_inventory, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ri of processedReturnItems) {
        insertReturnItemStmt.run(
          ri.id,
          ri.returnId,
          ri.shopId,
          ri.saleItemId,
          ri.itemType,
          ri.phoneId,
          ri.accessoryId,
          ri.productName,
          ri.identifier,
          ri.quantity,
          ri.unitRefundAmount,
          ri.restoredCost,
          ri.restoredToInventory,
          nowIso
        );
      }

      return {
        id: returnId,
        returnNo,
        saleId,
        invoiceNo: sale.invoice_no,
        returnType,
        totalRefundAmount,
        reason,
        itemsCount: processedReturnItems.length,
        createdAt: nowIso,
      };
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'RETURN_FAILED', message: err.message } });
  }
}

export async function processExchange(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const userId = req.user!.id;
  const userName = req.user!.name || 'Shop Staff';

  const parsed = exchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Exchange validation failed', details: parsed.error.flatten() },
    });
    return;
  }

  const { returnPayload, replacementItems, paymentMethod } = parsed.data;

  try {
    const exchangeResult = withTransaction((db) => {
      const sale = db.prepare(`SELECT * FROM sales WHERE id = ? AND shop_id = ?`).get(returnPayload.saleId, shopId) as any;
      if (!sale) {
        throw new Error('Original sale invoice not found');
      }

      const nowIso = new Date().toISOString();

      // 1. Process return part
      const returnNo = getNextReturnNumber(shopId, db);
      const returnId = `ret_${crypto.randomUUID()}`;
      let returnedItemsValue = 0.0;

      for (const item of returnPayload.items) {
        const saleItem = db.prepare(`SELECT * FROM sale_items WHERE id = ? AND sale_id = ?`).get(item.saleItemId, sale.id) as any;
        if (!saleItem) throw new Error(`Sale item not found`);

        const refundAmt = item.unitRefundAmount * item.quantity;
        returnedItemsValue += refundAmt;

        if (saleItem.item_type === 'PHONE' && saleItem.phone_id) {
          db.prepare(`UPDATE phone_inventory SET status = 'IN_STOCK', updated_at = ? WHERE id = ?`).run(nowIso, saleItem.phone_id);
        } else if (saleItem.item_type === 'ACCESSORY' && saleItem.accessory_id) {
          db.prepare(`UPDATE accessories SET available_quantity = available_quantity + ?, updated_at = ? WHERE id = ?`).run(
            item.quantity,
            nowIso,
            saleItem.accessory_id
          );
        }
      }

      db.prepare(`
        INSERT INTO returns (id, shop_id, return_no, sale_id, customer_id, return_type, total_refund_amount, reason, processed_by, created_at)
        VALUES (?, ?, ?, ?, ?, 'EXCHANGE', ?, ?, ?, ?)
      `).run(returnId, shopId, returnNo, sale.id, sale.customer_id, returnedItemsValue, returnPayload.reason, userId, nowIso);

      // 2. Calculate replacement items value and validate stock
      let newItemsValue = 0.0;
      let totalNewCost = 0.0;

      for (const rep of replacementItems) {
        if (rep.itemType === 'PHONE') {
          const ph = db.prepare(`SELECT * FROM phone_inventory WHERE id = ? AND shop_id = ?`).get(rep.productId, shopId) as any;
          if (!ph || ph.status !== 'IN_STOCK') {
            throw new Error(`Replacement phone is not available in stock`);
          }
          newItemsValue += rep.actualPrice;
          totalNewCost += ph.purchase_cost;
          db.prepare(`UPDATE phone_inventory SET status = 'SOLD', updated_at = ? WHERE id = ?`).run(nowIso, ph.id);
        } else {
          const acc = db.prepare(`SELECT * FROM accessories WHERE id = ? AND shop_id = ?`).get(rep.productId, shopId) as any;
          if (!acc || acc.available_quantity < rep.quantity) {
            throw new Error(`Insufficient stock for replacement accessory: ${acc ? acc.name : ''}`);
          }
          newItemsValue += rep.actualPrice * rep.quantity;
          totalNewCost += (acc.purchase_cost || 0) * rep.quantity;
          db.prepare(`UPDATE accessories SET available_quantity = available_quantity - ?, updated_at = ? WHERE id = ?`).run(
            rep.quantity,
            nowIso,
            acc.id
          );
        }
      }

      // 3. Difference calculation
      const rawDiff = newItemsValue - returnedItemsValue;
      let diffType: 'CUSTOMER_PAYS' | 'SHOP_REFUNDS' | 'EVEN' = 'EVEN';
      let diffAmount = 0.0;

      if (rawDiff > 0.001) {
        diffType = 'CUSTOMER_PAYS';
        diffAmount = Math.round(rawDiff * 100) / 100;
      } else if (rawDiff < -0.001) {
        diffType = 'SHOP_REFUNDS';
        diffAmount = Math.round(Math.abs(rawDiff) * 100) / 100;
      }

      // 4. Create new exchange sale record
      const newInvoiceNo = getNextInvoiceNumber(shopId, db);
      const newSaleId = `sale_${crypto.randomUUID()}`;

      db.prepare(`
        INSERT INTO sales (
          id, shop_id, invoice_no, customer_id, customer_name, customer_phone,
          subtotal, discount_amount, tax_rate, tax_amount, total_amount, amount_paid, balance_due,
          total_cost, gross_profit, payment_status, shopkeeper_id, shopkeeper_name, shop_snapshot, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, 0.0, ?, ?, 0.0, ?, ?, 'PAID', ?, ?, ?, ?, ?)
      `).run(
        newSaleId,
        shopId,
        newInvoiceNo,
        sale.customer_id,
        sale.customer_name,
        sale.customer_phone,
        newItemsValue,
        newItemsValue,
        newItemsValue,
        totalNewCost,
        newItemsValue - totalNewCost,
        userId,
        userName,
        sale.shop_snapshot,
        `Exchange against ${sale.invoice_no} / Return: ${returnNo}`,
        nowIso
      );

      // Record exchange link
      const exchangeId = `exch_${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO exchanges (id, shop_id, return_id, new_sale_id, returned_items_value, new_items_value, difference_amount, difference_type, payment_method, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        exchangeId,
        shopId,
        returnId,
        newSaleId,
        returnedItemsValue,
        newItemsValue,
        diffAmount,
        diffType,
        paymentMethod || 'CASH',
        nowIso
      );

      return {
        exchangeId,
        returnNo,
        newInvoiceNo,
        returnedItemsValue,
        newItemsValue,
        differenceAmount: diffAmount,
        differenceType: diffType,
        paymentMethod,
        createdAt: nowIso,
      };
    });

    res.status(201).json({ success: true, data: exchangeResult });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'EXCHANGE_FAILED', message: err.message } });
  }
}

export async function listReturns(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;

  const rows = queryAll<any>(
    `SELECT r.*, s.invoice_no, c.name as customer_name, u.name as processor_name
     FROM returns r
     LEFT JOIN sales s ON r.sale_id = s.id
     LEFT JOIN customers c ON r.customer_id = c.id
     LEFT JOIN users u ON r.processed_by = u.id
     WHERE r.shop_id = ?
     ORDER BY r.created_at DESC LIMIT 100`,
    [shopId]
  );

  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      returnNo: r.return_no,
      saleId: r.sale_id,
      invoiceNo: r.invoice_no,
      customerName: r.customer_name || 'Walk-in Customer',
      returnType: r.return_type,
      totalRefundAmount: r.total_refund_amount,
      reason: r.reason,
      processorName: r.processor_name || 'Staff',
      createdAt: r.created_at,
    })),
  });
}
