import { Request, Response } from 'express';
import { queryAll, SqlPrimitive } from '../database/query';

export interface GlobalSearchItem {
  id: string;
  category: 'phone' | 'accessory' | 'customer' | 'sale' | 'supplier';
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: 'success' | 'warning' | 'danger' | 'primary' | 'secondary' | 'info';
  price?: number;
  route: string;
  queryParams?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface GlobalSearchResults {
  phones: GlobalSearchItem[];
  accessories: GlobalSearchItem[];
  customers: GlobalSearchItem[];
  sales: GlobalSearchItem[];
  suppliers: GlobalSearchItem[];
  totalCount: number;
}

export async function searchGlobal(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const shopId = user.shopId;
  const rawQuery = req.query.q !== undefined ? String(req.query.q).trim() : '';

  const results: GlobalSearchResults = {
    phones: [],
    accessories: [],
    customers: [],
    sales: [],
    suppliers: [],
    totalCount: 0,
  };

  // If query is empty or less than 1 non-whitespace character, return empty sets
  if (!rawQuery) {
    res.json({
      success: true,
      data: results,
      totalCount: 0,
    });
    return;
  }

  const searchParam = `%${rawQuery}%`;
  const isAdmin = user.role === 'SHOP_ADMIN';
  const hasPerm = (p: string) => isAdmin || (user.permissions && user.permissions.includes(p));

  // 1. Phones (requires phones.view or inventory.view or admin)
  if (hasPerm('phones.view') || hasPerm('inventory.view')) {
    const phoneSql = `
      SELECT id, brand, model, imei1, imei2, ram, storage, color, condition, selling_price, status
      FROM phone_inventory
      WHERE shop_id = ?
        AND (brand LIKE ? OR model LIKE ? OR imei1 LIKE ? OR imei2 LIKE ? OR storage LIKE ? OR color LIKE ?)
      ORDER BY brand ASC, model ASC
      LIMIT 6
    `;
    const phones = queryAll<any>(phoneSql, [
      shopId,
      searchParam,
      searchParam,
      searchParam,
      searchParam,
      searchParam,
      searchParam,
    ]);

    results.phones = phones.map((ph) => {
      let tone: 'success' | 'warning' | 'danger' | 'secondary' = 'secondary';
      if (ph.status === 'IN_STOCK') tone = 'success';
      else if (ph.status === 'UNDER_REPAIR' || ph.status === 'RESERVED') tone = 'warning';
      else if (ph.status === 'RETURNED') tone = 'danger';

      return {
        id: ph.id,
        category: 'phone',
        title: `${ph.brand} ${ph.model}`,
        subtitle: `IMEI: ${ph.imei1}${ph.storage ? ' • ' + ph.storage : ''}${ph.color ? ' • ' + ph.color : ''}`,
        badge: ph.status.replace('_', ' '),
        badgeTone: tone,
        price: ph.selling_price,
        route: '/inventory/phones',
        queryParams: { search: ph.imei1 },
        metadata: {
          imei1: ph.imei1,
          imei2: ph.imei2,
          brand: ph.brand,
          model: ph.model,
          condition: ph.condition,
        },
      };
    });
  }

  // 2. Accessories (requires accessories.view or inventory.view or admin)
  if (hasPerm('accessories.view') || hasPerm('inventory.view')) {
    const accSql = `
      SELECT a.id, a.name, a.brand, a.model, a.sku, a.barcode, a.selling_price, a.available_quantity, c.name as category_name
      FROM accessories a
      LEFT JOIN accessory_categories c ON a.category_id = c.id
      WHERE a.shop_id = ?
        AND (a.name LIKE ? OR a.sku LIKE ? OR a.barcode LIKE ? OR a.brand LIKE ? OR c.name LIKE ?)
      ORDER BY a.name ASC
      LIMIT 6
    `;
    const accessories = queryAll<any>(accSql, [
      shopId,
      searchParam,
      searchParam,
      searchParam,
      searchParam,
      searchParam,
    ]);

    results.accessories = accessories.map((acc) => {
      const inStock = acc.available_quantity > 0;
      return {
        id: acc.id,
        category: 'accessory',
        title: acc.name,
        subtitle: `SKU: ${acc.sku}${acc.category_name ? ' • ' + acc.category_name : ''}`,
        badge: inStock ? `${acc.available_quantity} in stock` : 'Out of stock',
        badgeTone: inStock ? 'success' : 'danger',
        price: acc.selling_price,
        route: '/inventory/accessories',
        queryParams: { search: acc.sku },
        metadata: {
          sku: acc.sku,
          barcode: acc.barcode,
          brand: acc.brand,
          quantity: acc.available_quantity,
        },
      };
    });
  }

  // 3. Customers (requires customers.view or admin)
  if (hasPerm('customers.view')) {
    const custSql = `
      SELECT id, name, phone, cnic_masked, email, status
      FROM customers
      WHERE shop_id = ?
        AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR cnic_masked LIKE ?)
      ORDER BY name ASC
      LIMIT 6
    `;
    const customers = queryAll<any>(custSql, [
      shopId,
      searchParam,
      searchParam,
      searchParam,
      searchParam,
    ]);

    results.customers = customers.map((c) => ({
      id: c.id,
      category: 'customer',
      title: c.name,
      subtitle: [c.phone, c.cnic_masked ? `CNIC: ${c.cnic_masked}` : null, c.email].filter(Boolean).join(' • '),
      badge: c.status,
      badgeTone: c.status === 'ACTIVE' ? 'primary' : 'secondary',
      route: '/customers',
      queryParams: { search: c.name },
      metadata: {
        phone: c.phone,
        cnicMasked: c.cnic_masked,
        email: c.email,
      },
    }));
  }

  // 4. Sales / Invoices (requires pos.access or reports.view or admin)
  if (hasPerm('pos.access') || hasPerm('reports.view')) {
    const salesSql = `
      SELECT id, invoice_no, customer_name, customer_phone, total_amount, payment_status, created_at
      FROM sales
      WHERE shop_id = ?
        AND (invoice_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)
      ORDER BY created_at DESC
      LIMIT 6
    `;
    const sales = queryAll<any>(salesSql, [
      shopId,
      searchParam,
      searchParam,
      searchParam,
    ]);

    results.sales = sales.map((s) => {
      let tone: 'success' | 'warning' | 'danger' = 'secondary' as any;
      if (s.payment_status === 'PAID') tone = 'success';
      else if (s.payment_status === 'PARTIALLY_PAID') tone = 'warning';
      else if (s.payment_status === 'UNPAID' || s.payment_status === 'OVERDUE') tone = 'danger';

      return {
        id: s.id,
        category: 'sale',
        title: s.invoice_no,
        subtitle: `Customer: ${s.customer_name}${s.created_at ? ' • ' + s.created_at.slice(0, 10) : ''}`,
        badge: s.payment_status,
        badgeTone: tone,
        price: s.total_amount,
        route: '/customers',
        queryParams: { search: s.customer_name },
        metadata: {
          invoiceNo: s.invoice_no,
          customerName: s.customer_name,
        },
      };
    });
  }

  // 5. Suppliers (requires suppliers.view or admin)
  if (hasPerm('suppliers.view')) {
    const supSql = `
      SELECT id, name, contact_person, phone, email, status
      FROM suppliers
      WHERE shop_id = ?
        AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ? OR email LIKE ?)
      ORDER BY name ASC
      LIMIT 6
    `;
    const suppliers = queryAll<any>(supSql, [
      shopId,
      searchParam,
      searchParam,
      searchParam,
      searchParam,
    ]);

    results.suppliers = suppliers.map((sup) => ({
      id: sup.id,
      category: 'supplier',
      title: sup.name,
      subtitle: [sup.contact_person, sup.phone, sup.email].filter(Boolean).join(' • '),
      badge: sup.status,
      badgeTone: sup.status === 'ACTIVE' ? 'success' : 'secondary',
      route: '/inventory/suppliers',
      queryParams: { search: sup.name },
      metadata: {
        contactPerson: sup.contact_person,
        phone: sup.phone,
      },
    }));
  }

  results.totalCount =
    results.phones.length +
    results.accessories.length +
    results.customers.length +
    results.sales.length +
    results.suppliers.length;

  res.json({
    success: true,
    data: results,
    totalCount: results.totalCount,
  });
}
