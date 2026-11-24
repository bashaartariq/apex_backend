import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { queryOne } from '../database/query';
import { generateProductLabelPdf, LabelPdfData } from '../utils/pdf-generator';

const labelSchema = z.object({
  itemType: z.enum(['PHONE', 'ACCESSORY']),
  productId: z.string().min(1),
  labelFormat: z.string().default('STANDARD_50x30'),
});

// Instant Scan Lookup (Barcode / SKU / IMEI)
export async function lookupProductByIdentifier(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { identifier } = req.params;

  if (!identifier || identifier.trim().length === 0) {
    res.status(400).json({ success: false, error: { code: 'INVALID_IDENTIFIER', message: 'Identifier cannot be empty' } });
    return;
  }

  const cleanId = identifier.trim();

  // 1. Check Phone by IMEI 1 or IMEI 2
  const phone = queryOne<any>(
    `SELECT * FROM phone_inventory WHERE shop_id = ? AND (imei1 = ? OR imei2 = ?)`,
    [shopId, cleanId, cleanId]
  );

  if (phone) {
    res.json({
      success: true,
      data: {
        itemType: 'PHONE',
        id: phone.id,
        productName: `${phone.brand} ${phone.model}`,
        identifier: phone.imei1,
        imei2: phone.imei2,
        specs: `${phone.ram || ''}GB / ${phone.storage || ''}GB ${phone.color || ''}`,
        condition: phone.condition,
        sellingPrice: phone.selling_price,
        unitCost: phone.purchase_cost,
        stockQuantity: phone.status === 'IN_STOCK' ? 1 : 0,
        status: phone.status,
      },
    });
    return;
  }

  // 2. Check Accessory by Barcode or SKU
  const accessory = queryOne<any>(
    `SELECT a.*, c.name as category_name
     FROM accessories a
     LEFT JOIN accessory_categories c ON a.category_id = c.id
     WHERE a.shop_id = ? AND (a.barcode = ? OR a.sku = ?)`,
    [shopId, cleanId, cleanId]
  );

  if (accessory) {
    res.json({
      success: true,
      data: {
        itemType: 'ACCESSORY',
        id: accessory.id,
        productName: accessory.name,
        identifier: accessory.sku,
        barcode: accessory.barcode,
        specs: accessory.category_name || 'Accessories',
        condition: 'NEW',
        sellingPrice: accessory.selling_price,
        unitCost: accessory.purchase_cost || 0,
        stockQuantity: accessory.available_quantity,
        status: accessory.status,
      },
    });
    return;
  }

  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `No phone or accessory found matching identifier "${cleanId}"` },
  });
}

// Generate Printable Label PDF
export async function generateLabelPdf(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const parsed = labelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Label request invalid', details: parsed.error.flatten() },
    });
    return;
  }

  const { itemType, productId } = parsed.data;
  const shop = queryOne<any>(`SELECT name FROM shops WHERE id = ?`, [shopId]);
  const shopName = shop ? shop.name : 'Mobile Shop';

  let labelData: LabelPdfData | null = null;

  if (itemType === 'PHONE') {
    const phone = queryOne<any>(`SELECT * FROM phone_inventory WHERE id = ? AND shop_id = ?`, [productId, shopId]);
    if (!phone) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Phone not found' } });
      return;
    }
    labelData = {
      productName: `${phone.brand} ${phone.model}`,
      identifier: phone.imei1,
      sellingPrice: phone.selling_price,
      specs: `${phone.storage || ''}GB ${phone.color || ''}`,
      shopName,
    };
  } else {
    const acc = queryOne<any>(`SELECT * FROM accessories WHERE id = ? AND shop_id = ?`, [productId, shopId]);
    if (!acc) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Accessory not found' } });
      return;
    }
    labelData = {
      productName: acc.name,
      identifier: acc.barcode || acc.sku,
      sellingPrice: acc.selling_price,
      specs: acc.sku,
      shopName,
    };
  }

  const buffer = generateProductLabelPdf(labelData);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="label-${labelData.identifier}.pdf"`);
  res.send(buffer);
}
