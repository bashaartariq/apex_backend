import { Request, Response } from 'express';
import { queryAll, queryOne, SqlPrimitive } from '../database/query';
import { buildDateFilter } from '../utils/date-filters';
import { generateCsv, CsvColumn } from '../utils/csv-generator';
import { generateReportPdf, ReportPdfData } from '../utils/pdf-generator';
import { AppError } from '../middleware/errorHandler';

// -----------------------------------------------------------------------------
// 1. SALES REPORTS
// -----------------------------------------------------------------------------
export async function getSalesReports(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const isAdmin = req.user!.role === 'SHOP_ADMIN';
  const {
    range,
    dateFrom,
    dateTo,
    productType,
    phoneCondition,
    brand,
    customerId,
    shopkeeperId,
    paymentStatus,
    paymentMethod,
  } = req.query as Record<string, string | undefined>;

  const dateFilter = buildDateFilter(range, dateFrom, dateTo, 's.created_at');
  const whereClauses: string[] = ['s.shop_id = ?', 's.is_reversed = 0', dateFilter.sql];
  const params: SqlPrimitive[] = [shopId, ...dateFilter.params];

  if (customerId && customerId.trim()) {
    whereClauses.push('s.customer_id = ?');
    params.push(customerId.trim());
  }

  if (shopkeeperId && shopkeeperId.trim()) {
    whereClauses.push('s.shopkeeper_id = ?');
    params.push(shopkeeperId.trim());
  }

  if (paymentStatus && paymentStatus.trim()) {
    whereClauses.push('s.payment_status = ?');
    params.push(paymentStatus.trim().toUpperCase());
  }

  // Filter by product criteria if provided
  if (productType || phoneCondition || brand) {
    const itemConditions: string[] = ['si.sale_id = s.id', 'si.shop_id = s.shop_id'];
    const itemParams: SqlPrimitive[] = [];

    if (productType && productType.trim()) {
      itemConditions.push('si.item_type = ?');
      itemParams.push(productType.trim().toUpperCase());
    }
    if (phoneCondition && phoneCondition.trim()) {
      itemConditions.push('si.condition = ?');
      itemParams.push(phoneCondition.trim().toUpperCase());
    }
    if (brand && brand.trim()) {
      itemConditions.push('LOWER(si.product_name) LIKE ?');
      itemParams.push(`%${brand.trim().toLowerCase()}%`);
    }

    whereClauses.push(`EXISTS (SELECT 1 FROM sale_items si WHERE ${itemConditions.join(' AND ')})`);
    params.push(...itemParams);
  }

  // Filter by payment method
  if (paymentMethod && paymentMethod.trim()) {
    whereClauses.push(
      'EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id AND sp.shop_id = s.shop_id AND sp.payment_method = ?)'
    );
    params.push(paymentMethod.trim().toUpperCase());
  }

  const whereSql = whereClauses.join(' AND ');

  // Summary aggregation
  const summaryRow = queryOne<any>(
    `SELECT COUNT(*) as total_transactions,
            COALESCE(SUM(s.subtotal), 0.0) as total_subtotal,
            COALESCE(SUM(s.discount_amount), 0.0) as total_discounts,
            COALESCE(SUM(s.tax_amount), 0.0) as total_tax,
            COALESCE(SUM(s.total_amount), 0.0) as total_sales,
            COALESCE(SUM(s.amount_paid), 0.0) as total_collected,
            COALESCE(SUM(s.balance_due), 0.0) as total_outstanding,
            COALESCE(SUM(s.gross_profit), 0.0) as total_profit
     FROM sales s
     WHERE ${whereSql}`,
    params
  ) || {
    total_transactions: 0,
    total_subtotal: 0,
    total_discounts: 0,
    total_tax: 0,
    total_sales: 0,
    total_collected: 0,
    total_outstanding: 0,
    total_profit: 0,
  };

  // Payment method breakdown
  const paymentRows = queryAll<any>(
    `SELECT sp.payment_method, COUNT(*) as count, COALESCE(SUM(sp.amount), 0.0) as total
     FROM sale_payments sp
     JOIN sales s ON sp.sale_id = s.id
     WHERE ${whereSql}
     GROUP BY sp.payment_method
     ORDER BY total DESC`,
    params
  );

  // Sales records list
  const sales = queryAll<any>(
    `SELECT s.id, s.invoice_no, s.customer_name, s.customer_phone,
            s.subtotal, s.discount_amount, s.tax_amount, s.total_amount,
            s.amount_paid, s.balance_due, s.gross_profit, s.payment_status,
            s.shopkeeper_name, s.created_at,
            (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as item_count
     FROM sales s
     WHERE ${whereSql}
     ORDER BY s.created_at DESC`,
    params
  );

  res.json({
    success: true,
    data: {
      rangeLabel: dateFilter.rangeLabel,
      summary: {
        totalTransactions: summaryRow.total_transactions,
        totalSubtotal: summaryRow.total_subtotal,
        totalDiscounts: summaryRow.total_discounts,
        totalTax: summaryRow.total_tax,
        totalSales: summaryRow.total_sales,
        totalCollected: summaryRow.total_collected,
        totalOutstanding: summaryRow.total_outstanding,
        // Shopkeeper must NEVER see gross profit
        totalGrossProfit: isAdmin ? summaryRow.total_profit : null,
      },
      paymentBreakdown: paymentRows.map((p) => ({
        paymentMethod: p.payment_method,
        count: p.count,
        total: p.total,
      })),
      sales: sales.map((s) => ({
        id: s.id,
        invoiceNo: s.invoice_no,
        customerName: s.customer_name,
        customerPhone: s.customer_phone,
        subtotal: s.subtotal,
        discountAmount: s.discount_amount,
        taxAmount: s.tax_amount,
        totalAmount: s.total_amount,
        amountPaid: s.amount_paid,
        balanceDue: s.balance_due,
        grossProfit: isAdmin ? s.gross_profit : null,
        paymentStatus: s.payment_status,
        shopkeeperName: s.shopkeeper_name,
        itemCount: s.item_count,
        createdAt: s.created_at,
      })),
    },
  });
}

// -----------------------------------------------------------------------------
// 2. PURCHASES REPORTS (SHOP_ADMIN ONLY)
// -----------------------------------------------------------------------------
export async function getPurchasesReports(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { range, dateFrom, dateTo, supplierId, status } = req.query as Record<string, string | undefined>;

  const dateFilter = buildDateFilter(range, dateFrom, dateTo, 'p.purchase_date');
  const whereClauses: string[] = ['p.shop_id = ?', dateFilter.sql];
  const params: SqlPrimitive[] = [shopId, ...dateFilter.params];

  if (supplierId && supplierId.trim()) {
    whereClauses.push('p.supplier_id = ?');
    params.push(supplierId.trim());
  }

  if (status && status.trim()) {
    whereClauses.push('p.status = ?');
    params.push(status.trim().toUpperCase());
  }

  const whereSql = whereClauses.join(' AND ');

  // Summary aggregation
  const summaryRow = queryOne<any>(
    `SELECT COUNT(*) as total_orders,
            COALESCE(SUM(p.total_amount), 0.0) as total_expenditure,
            COALESCE(SUM(p.tax_amount), 0.0) as total_tax,
            COALESCE(SUM(p.discount_amount), 0.0) as total_discounts
     FROM purchases p
     WHERE ${whereSql}`,
    params
  ) || { total_orders: 0, total_expenditure: 0, total_tax: 0, total_discounts: 0 };

  // Supplier breakdown
  const supplierRows = queryAll<any>(
    `SELECT COALESCE(s.name, 'Direct') as supplier_name,
            COUNT(*) as orders_count,
            COALESCE(SUM(p.total_amount), 0.0) as total_spent
     FROM purchases p
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE ${whereSql}
     GROUP BY p.supplier_id
     ORDER BY total_spent DESC`,
    params
  );

  // Purchases list
  const purchases = queryAll<any>(
    `SELECT p.id, p.reference_no, p.purchase_date, p.status,
            p.total_amount, p.tax_amount, p.discount_amount, p.notes,
            s.name as supplier_name, s.phone as supplier_phone,
            (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) as item_count
     FROM purchases p
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE ${whereSql}
     ORDER BY p.purchase_date DESC, p.created_at DESC`,
    params
  );

  res.json({
    success: true,
    data: {
      rangeLabel: dateFilter.rangeLabel,
      summary: {
        totalOrders: summaryRow.total_orders,
        totalExpenditure: summaryRow.total_expenditure,
        totalTax: summaryRow.total_tax,
        totalDiscounts: summaryRow.total_discounts,
      },
      supplierBreakdown: supplierRows.map((s) => ({
        supplierName: s.supplier_name,
        ordersCount: s.orders_count,
        totalSpent: s.total_spent,
      })),
      purchases: purchases.map((p) => ({
        id: p.id,
        referenceNo: p.reference_no,
        purchaseDate: p.purchase_date,
        status: p.status,
        totalAmount: p.total_amount,
        taxAmount: p.tax_amount,
        discountAmount: p.discount_amount,
        supplierName: p.supplier_name || 'Direct',
        supplierPhone: p.supplier_phone || '',
        itemCount: p.item_count,
        notes: p.notes,
      })),
    },
  });
}

// -----------------------------------------------------------------------------
// 3. INVENTORY & VALUATION REPORTS
// -----------------------------------------------------------------------------
export async function getInventoryReports(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const isAdmin = req.user!.role === 'SHOP_ADMIN';
  const { type, brand, condition, status, lowStockOnly } = req.query as Record<string, string | undefined>;

  // 1. Valuation Calculations (Admin only)
  let valuation = null;
  if (isAdmin) {
    const phoneValRow = queryOne<any>(
      `SELECT COUNT(*) as in_stock_count,
              SUM(CASE WHEN condition = 'NEW' THEN 1 ELSE 0 END) as new_count,
              SUM(CASE WHEN condition = 'USED' THEN 1 ELSE 0 END) as used_count,
              COALESCE(SUM(purchase_cost), 0.0) as phone_value
       FROM phone_inventory
       WHERE shop_id = ? AND status = 'IN_STOCK'`,
      [shopId]
    ) || { in_stock_count: 0, new_count: 0, used_count: 0, phone_value: 0 };

    const accValRow = queryOne<any>(
      `SELECT COALESCE(SUM(b.remaining_quantity * b.unit_cost), 0.0) as acc_value,
              COALESCE(SUM(b.remaining_quantity), 0) as acc_units
       FROM accessory_batches b
       WHERE b.shop_id = ? AND b.remaining_quantity > 0`,
      [shopId]
    ) || { acc_value: 0, acc_units: 0 };

    const lowStockCountRow = queryOne<any>(
      `SELECT COUNT(*) as low_count
       FROM accessories
       WHERE shop_id = ? AND status = 'ACTIVE' AND available_quantity <= min_stock_threshold`,
      [shopId]
    ) || { low_count: 0 };

    valuation = {
      totalValuation: Math.round((phoneValRow.phone_value + accValRow.acc_value) * 100) / 100,
      phoneValuation: Math.round(phoneValRow.phone_value * 100) / 100,
      accessoryValuation: Math.round(accValRow.acc_value * 100) / 100,
      phonesInStockCount: phoneValRow.in_stock_count,
      newPhonesCount: phoneValRow.new_count,
      usedPhonesCount: phoneValRow.used_count,
      accessoriesUnitsCount: accValRow.acc_units,
      lowStockAccessoriesCount: lowStockCountRow.low_count,
    };
  }

  // 2. Phones Listing
  let phones: any[] = [];
  if (!type || type === 'ALL' || type === 'PHONE') {
    const phoneWhere: string[] = ['shop_id = ?'];
    const phoneParams: SqlPrimitive[] = [shopId];

    if (brand && brand.trim()) {
      phoneWhere.push('LOWER(brand) LIKE ?');
      phoneParams.push(`%${brand.trim().toLowerCase()}%`);
    }
    if (condition && condition.trim()) {
      phoneWhere.push('condition = ?');
      phoneParams.push(condition.trim().toUpperCase());
    }
    if (status && status.trim()) {
      phoneWhere.push('status = ?');
      phoneParams.push(status.trim().toUpperCase());
    } else {
      // Default to IN_STOCK if not specified
      phoneWhere.push("status = 'IN_STOCK'");
    }

    phones = queryAll<any>(
      `SELECT id, brand, model, imei1, imei2, ram, storage, color, condition,
              purchase_cost, selling_price, battery_health, physical_condition,
              status, purchase_date, created_at
       FROM phone_inventory
       WHERE ${phoneWhere.join(' AND ')}
       ORDER BY brand ASC, model ASC`,
      phoneParams
    );
  }

  // 3. Accessories Listing
  let accessories: any[] = [];
  if (!type || type === 'ALL' || type === 'ACCESSORY') {
    const accWhere: string[] = ['a.shop_id = ?'];
    const accParams: SqlPrimitive[] = [shopId];

    if (brand && brand.trim()) {
      accWhere.push('(LOWER(a.brand) LIKE ? OR LOWER(a.name) LIKE ?)');
      accParams.push(`%${brand.trim().toLowerCase()}%`, `%${brand.trim().toLowerCase()}%`);
    }
    if (status && status.trim()) {
      accWhere.push('a.status = ?');
      accParams.push(status.trim().toUpperCase());
    }
    if (lowStockOnly === 'true') {
      accWhere.push('a.available_quantity <= a.min_stock_threshold');
    }

    accessories = queryAll<any>(
      `SELECT a.id, a.name, a.brand, a.model, a.sku, a.barcode,
              a.purchase_cost, a.selling_price, a.available_quantity,
              a.min_stock_threshold, a.status,
              (a.available_quantity <= a.min_stock_threshold) as is_low_stock,
              c.name as category_name
       FROM accessories a
       LEFT JOIN accessory_categories c ON a.category_id = c.id
       WHERE ${accWhere.join(' AND ')}
       ORDER BY a.name ASC`,
      accParams
    );
  }

  res.json({
    success: true,
    data: {
      valuation,
      phones: phones.map((p) => ({
        id: p.id,
        brand: p.brand,
        model: p.model,
        imei1: p.imei1,
        imei2: p.imei2,
        ram: p.ram,
        storage: p.storage,
        color: p.color,
        condition: p.condition,
        // Shopkeeper must NEVER see purchase cost
        purchaseCost: isAdmin ? p.purchase_cost : null,
        sellingPrice: p.selling_price,
        batteryHealth: p.battery_health,
        physicalCondition: p.physical_condition,
        status: p.status,
        purchaseDate: p.purchase_date,
      })),
      accessories: accessories.map((a) => ({
        id: a.id,
        name: a.name,
        brand: a.brand,
        model: a.model,
        sku: a.sku,
        barcode: a.barcode,
        categoryName: a.category_name || 'General',
        // Shopkeeper must NEVER see purchase cost
        purchaseCost: isAdmin ? a.purchase_cost : null,
        sellingPrice: a.selling_price,
        availableQuantity: a.available_quantity,
        minStockThreshold: a.min_stock_threshold,
        isLowStock: Boolean(a.is_low_stock),
        status: a.status,
      })),
    },
  });
}

// -----------------------------------------------------------------------------
// 4. ACCURATE GROSS PROFIT REPORTS (SHOP_ADMIN ONLY)
// -----------------------------------------------------------------------------
export async function getProfitReports(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { range, dateFrom, dateTo, productType, brand } = req.query as Record<string, string | undefined>;

  const dateFilter = buildDateFilter(range, dateFrom, dateTo, 's.created_at');
  const whereClauses: string[] = ['si.shop_id = ?', 's.is_reversed = 0', dateFilter.sql];
  const params: SqlPrimitive[] = [shopId, ...dateFilter.params];

  if (productType && productType.trim()) {
    whereClauses.push('si.item_type = ?');
    params.push(productType.trim().toUpperCase());
  }

  if (brand && brand.trim()) {
    whereClauses.push('LOWER(si.product_name) LIKE ?');
    params.push(`%${brand.trim().toLowerCase()}%`);
  }

  const whereSql = whereClauses.join(' AND ');

  // Summary aggregation of sold items
  const summaryRow = queryOne<any>(
    `SELECT COUNT(*) as line_items_count,
            COALESCE(SUM(si.quantity), 0) as total_units_sold,
            COALESCE(SUM(si.subtotal), 0.0) as total_revenue,
            COALESCE(SUM(si.unit_cost * si.quantity), 0.0) as total_cogs,
            COALESCE(SUM(si.profit), 0.0) as total_gross_profit
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     WHERE ${whereSql}`,
    params
  ) || {
    line_items_count: 0,
    total_units_sold: 0,
    total_revenue: 0,
    total_cogs: 0,
    total_gross_profit: 0,
  };

  // Check returns during the same date period to ensure profit is not overstated
  const returnDateFilter = buildDateFilter(range, dateFrom, dateTo, 'r.created_at');
  const returnRow = queryOne<any>(
    `SELECT COUNT(*) as return_count,
            COALESCE(SUM(r.total_refund_amount), 0.0) as total_refunds
     FROM returns r
     WHERE r.shop_id = ? AND ${returnDateFilter.sql}`,
    [shopId, ...returnDateFilter.params]
  ) || { return_count: 0, total_refunds: 0 };

  const netGrossProfit = Math.round((summaryRow.total_gross_profit - returnRow.total_refunds) * 100) / 100;
  const profitMarginPct =
    summaryRow.total_revenue > 0
      ? Math.round((netGrossProfit / summaryRow.total_revenue) * 1000) / 10
      : 0.0;

  // Breakdown by product type (PHONE vs ACCESSORY)
  const typeBreakdown = queryAll<any>(
    `SELECT si.item_type,
            COALESCE(SUM(si.quantity), 0) as units_sold,
            COALESCE(SUM(si.subtotal), 0.0) as revenue,
            COALESCE(SUM(si.unit_cost * si.quantity), 0.0) as cogs,
            COALESCE(SUM(si.profit), 0.0) as profit
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     WHERE ${whereSql}
     GROUP BY si.item_type`,
    params
  );

  // Daily profit trend
  const dailyProfit = queryAll<any>(
    `SELECT date(s.created_at) as sale_date,
            COALESCE(SUM(si.subtotal), 0.0) as revenue,
            COALESCE(SUM(si.unit_cost * si.quantity), 0.0) as cogs,
            COALESCE(SUM(si.profit), 0.0) as profit
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     WHERE ${whereSql}
     GROUP BY date(s.created_at)
     ORDER BY date(s.created_at) ASC`,
    params
  );

  // Line items detailed list (limit 100 for responsive UI)
  const lineItems = queryAll<any>(
    `SELECT si.id, s.invoice_no, s.created_at as sale_date, s.customer_name,
            si.item_type, si.product_name, si.condition, si.quantity,
            si.unit_cost, si.actual_price, si.discount, si.subtotal, si.profit,
            ROUND((si.profit / NULLIF(si.subtotal, 0.0)) * 100, 1) as margin_pct
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     WHERE ${whereSql}
     ORDER BY s.created_at DESC LIMIT 100`,
    params
  );

  res.json({
    success: true,
    data: {
      rangeLabel: dateFilter.rangeLabel,
      summary: {
        totalRevenue: summaryRow.total_revenue,
        totalCogs: summaryRow.total_cogs,
        grossProfit: summaryRow.total_gross_profit,
        returnsDeduction: returnRow.total_refunds,
        returnsCount: returnRow.return_count,
        netGrossProfit,
        profitMarginPct,
        totalUnitsSold: summaryRow.total_units_sold,
      },
      typeBreakdown: typeBreakdown.map((t) => ({
        itemType: t.item_type,
        unitsSold: t.units_sold,
        revenue: t.revenue,
        cogs: t.cogs,
        profit: t.profit,
        marginPct: t.revenue > 0 ? Math.round((t.profit / t.revenue) * 1000) / 10 : 0.0,
      })),
      dailyProfit: dailyProfit.map((d) => ({
        date: d.sale_date,
        revenue: d.revenue,
        cogs: d.cogs,
        profit: d.profit,
      })),
      lineItems: lineItems.map((li) => ({
        id: li.id,
        invoiceNo: li.invoice_no,
        saleDate: li.sale_date,
        customerName: li.customer_name,
        itemType: li.item_type,
        productName: li.product_name,
        condition: li.condition,
        quantity: li.quantity,
        unitCost: li.unit_cost,
        actualPrice: li.actual_price,
        discount: li.discount,
        subtotal: li.subtotal,
        profit: li.profit,
        marginPct: li.margin_pct || 0.0,
      })),
    },
  });
}

// -----------------------------------------------------------------------------
// 5. CUSTOMER & CREDIT DEBTORS REPORTS
// -----------------------------------------------------------------------------
export async function getCustomerCreditReports(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { debtorsOnly = 'true', search } = req.query as Record<string, string | undefined>;

  const whereClauses: string[] = ['c.shop_id = ?'];
  const params: SqlPrimitive[] = [shopId];

  if (debtorsOnly === 'true') {
    whereClauses.push('c.outstanding_balance > 0');
  }

  if (search && search.trim()) {
    whereClauses.push('(LOWER(c.name) LIKE ? OR c.phone LIKE ?)');
    params.push(`%${search.trim().toLowerCase()}%`, `%${search.trim()}%`);
  }

  const whereSql = whereClauses.join(' AND ');

  // Summary aggregation
  const summaryRow = queryOne<any>(
    `SELECT COUNT(*) as total_customers,
            COUNT(CASE WHEN c.outstanding_balance > 0 THEN 1 END) as active_debtors,
            COALESCE(SUM(c.outstanding_balance), 0.0) as total_debt,
            COALESCE(SUM(c.credit_limit), 0.0) as total_credit_limit
     FROM customers c
     WHERE c.shop_id = ?`,
    [shopId]
  ) || { total_customers: 0, active_debtors: 0, total_debt: 0, total_credit_limit: 0 };

  // Total overdue invoices across all customers
  const overdueRow = queryOne<any>(
    `SELECT COUNT(*) as overdue_count, COALESCE(SUM(balance_due), 0.0) as overdue_amount
     FROM sales
     WHERE shop_id = ? AND payment_status IN ('PARTIAL', 'UNPAID')
       AND is_reversed = 0 AND due_date IS NOT NULL AND date(due_date) < date('now')`,
    [shopId]
  ) || { overdue_count: 0, overdue_amount: 0 };

  // Customer debtors list with enriched metrics
  const customers = queryAll<any>(
    `SELECT c.id, c.name, c.phone, c.cnic_masked, c.credit_limit, c.outstanding_balance,
            (c.credit_limit - c.outstanding_balance) as available_credit,
            c.status, c.created_at,
            (SELECT COUNT(*) FROM sales s
             WHERE s.customer_id = c.id AND s.shop_id = c.shop_id
               AND s.payment_status IN ('PARTIAL', 'UNPAID')
               AND s.is_reversed = 0 AND s.due_date IS NOT NULL AND date(s.due_date) < date('now')) as overdue_invoices_count,
            (SELECT COALESCE(SUM(total_amount), 0.0) FROM sales s
             WHERE s.customer_id = c.id AND s.shop_id = c.shop_id AND s.is_reversed = 0) as total_purchased,
            (SELECT COALESCE(SUM(amount_received), 0.0) FROM customer_payment_receipts r
             WHERE r.customer_id = c.id AND r.shop_id = c.shop_id) as total_paid
     FROM customers c
     WHERE ${whereSql}
     ORDER BY c.outstanding_balance DESC, c.name ASC`,
    params
  );

  res.json({
    success: true,
    data: {
      summary: {
        totalCustomers: summaryRow.total_customers,
        activeDebtors: summaryRow.active_debtors,
        totalOutstandingDebt: summaryRow.total_debt,
        totalCreditLimit: summaryRow.total_credit_limit,
        overdueInvoicesCount: overdueRow.overdue_count,
        overdueAmount: overdueRow.overdue_amount,
      },
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        cnicMasked: c.cnic_masked,
        creditLimit: c.credit_limit,
        outstandingBalance: c.outstanding_balance,
        availableCredit: c.available_credit,
        overdueInvoicesCount: c.overdue_invoices_count,
        totalPurchased: c.total_purchased,
        totalPaid: c.total_paid,
        status: c.status,
      })),
    },
  });
}

// -----------------------------------------------------------------------------
// 6. RETURNS & WARRANTY REPORTS
// -----------------------------------------------------------------------------
export async function getReturnsWarrantyReports(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const { range, dateFrom, dateTo, type = 'ALL' } = req.query as Record<string, string | undefined>;

  const dateFilterReturns = buildDateFilter(range, dateFrom, dateTo, 'r.created_at');
  const dateFilterWarranty = buildDateFilter(range, dateFrom, dateTo, 'wc.created_at');

  let returnsList: any[] = [];
  let warrantyClaimsList: any[] = [];

  // 1. Returns list
  if (type === 'ALL' || type === 'RETURNS') {
    returnsList = queryAll<any>(
      `SELECT r.id, r.return_no, s.invoice_no, c.name as customer_name,
              r.return_type, r.total_refund_amount, r.reason, r.created_at
       FROM returns r
       LEFT JOIN sales s ON r.sale_id = s.id
       LEFT JOIN customers c ON r.customer_id = c.id
       WHERE r.shop_id = ? AND ${dateFilterReturns.sql}
       ORDER BY r.created_at DESC`,
      [shopId, ...dateFilterReturns.params]
    );
  }

  // 2. Warranty Claims list
  if (type === 'ALL' || type === 'WARRANTY') {
    warrantyClaimsList = queryAll<any>(
      `SELECT wc.id, wc.claim_ref, s.invoice_no, c.name as customer_name,
              wc.problem_description, wc.status, wc.labor_cost, wc.customer_charge,
              wc.created_at, wc.resolved_at
       FROM warranty_claims wc
       LEFT JOIN sales s ON wc.sale_id = s.id
       LEFT JOIN customers c ON wc.customer_id = c.id
       WHERE wc.shop_id = ? AND ${dateFilterWarranty.sql}
       ORDER BY wc.created_at DESC`,
      [shopId, ...dateFilterWarranty.params]
    );
  }

  // Summary aggregation
  const returnSummary = queryOne<any>(
    `SELECT COUNT(*) as return_count, COALESCE(SUM(total_refund_amount), 0.0) as total_refunds
     FROM returns r
     WHERE r.shop_id = ? AND ${dateFilterReturns.sql}`,
    [shopId, ...dateFilterReturns.params]
  ) || { return_count: 0, total_refunds: 0 };

  const warrantySummary = queryOne<any>(
    `SELECT COUNT(*) as total_claims,
            COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_claims,
            COUNT(CASE WHEN status IN ('REPAIRED', 'REPLACED') THEN 1 END) as resolved_claims,
            COALESCE(SUM(labor_cost), 0.0) as total_repair_costs
     FROM warranty_claims wc
     WHERE wc.shop_id = ? AND ${dateFilterWarranty.sql}`,
    [shopId, ...dateFilterWarranty.params]
  ) || { total_claims: 0, pending_claims: 0, resolved_claims: 0, total_repair_costs: 0 };

  res.json({
    success: true,
    data: {
      rangeLabel: dateFilterReturns.rangeLabel,
      summary: {
        totalReturnsCount: returnSummary.return_count,
        totalRefundAmount: returnSummary.total_refunds,
        totalClaimsCount: warrantySummary.total_claims,
        pendingClaimsCount: warrantySummary.pending_claims,
        resolvedClaimsCount: warrantySummary.resolved_claims,
        totalRepairCosts: warrantySummary.total_repair_costs,
      },
      returns: returnsList.map((r) => ({
        id: r.id,
        returnNo: r.return_no,
        invoiceNo: r.invoice_no,
        customerName: r.customer_name || 'Walk-in Customer',
        returnType: r.return_type,
        totalRefundAmount: r.total_refund_amount,
        reason: r.reason,
        createdAt: r.created_at,
      })),
      warrantyClaims: warrantyClaimsList.map((wc) => ({
        id: wc.id,
        claimRef: wc.claim_ref,
        invoiceNo: wc.invoice_no,
        customerName: wc.customer_name || 'Customer',
        problemDescription: wc.problem_description,
        status: wc.status,
        laborCost: wc.labor_cost,
        customerCharge: wc.customer_charge,
        createdAt: wc.created_at,
        resolvedAt: wc.resolved_at,
      })),
    },
  });
}

// -----------------------------------------------------------------------------
// 7. CSV EXPORT (RFC 4180 with CSV Formula Injection Protection)
// -----------------------------------------------------------------------------
export async function exportCsv(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const isAdmin = req.user!.role === 'SHOP_ADMIN';
  const report = (req.query.report as string || 'sales').toLowerCase();

  // Enforce role on sensitive reports
  if ((report === 'purchases' || report === 'profit') && !isAdmin) {
    throw new AppError(403, 'FORBIDDEN_ROLE', 'Only Shop Admin can export this report.');
  }

  let csvContent = '';
  const now = new Date().toISOString().slice(0, 10);

  if (report === 'sales') {
    const dateFilter = buildDateFilter(req.query.range as string, req.query.dateFrom as string, req.query.dateTo as string, 's.created_at');
    const sales = queryAll<any>(
      `SELECT s.invoice_no, s.customer_name, s.customer_phone,
              s.subtotal, s.discount_amount, s.tax_amount, s.total_amount,
              s.amount_paid, s.balance_due, s.gross_profit, s.payment_status,
              s.shopkeeper_name, s.created_at
       FROM sales s
       WHERE s.shop_id = ? AND s.is_reversed = 0 AND ${dateFilter.sql}
       ORDER BY s.created_at DESC`,
      [shopId, ...dateFilter.params]
    );

    const columns: CsvColumn<any>[] = [
      { header: 'Invoice No', key: 'invoice_no' },
      { header: 'Date', key: 'created_at' },
      { header: 'Customer', key: 'customer_name' },
      { header: 'Phone', key: 'customer_phone' },
      { header: 'Subtotal ($)', key: 'subtotal' },
      { header: 'Discount ($)', key: 'discount_amount' },
      { header: 'Tax ($)', key: 'tax_amount' },
      { header: 'Total ($)', key: 'total_amount' },
      { header: 'Paid ($)', key: 'amount_paid' },
      { header: 'Balance Due ($)', key: 'balance_due' },
      { header: 'Status', key: 'payment_status' },
      { header: 'Cashier', key: 'shopkeeper_name' },
    ];

    if (isAdmin) {
      columns.push({ header: 'Gross Profit ($)', key: 'gross_profit' });
    }

    csvContent = generateCsv(sales, columns);
  } else if (report === 'purchases') {
    const dateFilter = buildDateFilter(req.query.range as string, req.query.dateFrom as string, req.query.dateTo as string, 'p.purchase_date');
    const purchases = queryAll<any>(
      `SELECT p.reference_no, p.purchase_date, p.status, p.total_amount,
              p.tax_amount, p.discount_amount, s.name as supplier_name, p.notes
       FROM purchases p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.shop_id = ? AND ${dateFilter.sql}
       ORDER BY p.purchase_date DESC`,
      [shopId, ...dateFilter.params]
    );

    const columns: CsvColumn<any>[] = [
      { header: 'Purchase Ref', key: 'reference_no' },
      { header: 'Date', key: 'purchase_date' },
      { header: 'Supplier', transform: (r) => r.supplier_name || 'Direct' },
      { header: 'Status', key: 'status' },
      { header: 'Discount ($)', key: 'discount_amount' },
      { header: 'Tax ($)', key: 'tax_amount' },
      { header: 'Total ($)', key: 'total_amount' },
      { header: 'Notes', key: 'notes' },
    ];

    csvContent = generateCsv(purchases, columns);
  } else if (report === 'inventory') {
    const phones = queryAll<any>(
      `SELECT brand, model, imei1, ram, storage, color, condition,
              purchase_cost, selling_price, status
       FROM phone_inventory
       WHERE shop_id = ? AND status = 'IN_STOCK'`,
      [shopId]
    );

    const columns: CsvColumn<any>[] = [
      { header: 'Product Type', transform: () => 'Mobile Phone' },
      { header: 'Brand', key: 'brand' },
      { header: 'Model', key: 'model' },
      { header: 'Identifier', key: 'imei1' },
      { header: 'Specs', transform: (r) => `${r.ram || ''}GB / ${r.storage || ''}GB ${r.color || ''}`.trim() },
      { header: 'Condition', key: 'condition' },
      { header: 'Selling Price ($)', key: 'selling_price' },
      { header: 'Status', key: 'status' },
    ];

    if (isAdmin) {
      columns.push({ header: 'Purchase Cost ($)', key: 'purchase_cost' });
    }

    csvContent = generateCsv(phones, columns);
  } else if (report === 'profit') {
    const dateFilter = buildDateFilter(req.query.range as string, req.query.dateFrom as string, req.query.dateTo as string, 's.created_at');
    const items = queryAll<any>(
      `SELECT s.invoice_no, s.created_at as sale_date, s.customer_name,
              si.item_type, si.product_name, si.quantity, si.unit_cost,
              si.actual_price, si.discount, si.subtotal, si.profit
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE si.shop_id = ? AND s.is_reversed = 0 AND ${dateFilter.sql}
       ORDER BY s.created_at DESC`,
      [shopId, ...dateFilter.params]
    );

    const columns: CsvColumn<any>[] = [
      { header: 'Invoice No', key: 'invoice_no' },
      { header: 'Date', key: 'sale_date' },
      { header: 'Customer', key: 'customer_name' },
      { header: 'Item Type', key: 'item_type' },
      { header: 'Product Name', key: 'product_name' },
      { header: 'Quantity', key: 'quantity' },
      { header: 'Selling Price ($)', key: 'actual_price' },
      { header: 'Unit Cost ($)', key: 'unit_cost' },
      { header: 'Revenue ($)', key: 'subtotal' },
      { header: 'Gross Profit ($)', key: 'profit' },
      {
        header: 'Margin (%)',
        transform: (r) => (r.subtotal > 0 ? (Math.round((r.profit / r.subtotal) * 1000) / 10).toFixed(1) : '0.0'),
      },
    ];

    csvContent = generateCsv(items, columns);
  } else if (report === 'customers') {
    const customers = queryAll<any>(
      `SELECT name, phone, cnic_masked, credit_limit, outstanding_balance, status
       FROM customers
       WHERE shop_id = ?
       ORDER BY outstanding_balance DESC`,
      [shopId]
    );

    const columns: CsvColumn<any>[] = [
      { header: 'Customer Name', key: 'name' },
      { header: 'Phone', key: 'phone' },
      { header: 'CNIC', key: 'cnic_masked' },
      { header: 'Credit Limit ($)', key: 'credit_limit' },
      { header: 'Outstanding Balance ($)', key: 'outstanding_balance' },
      { header: 'Status', key: 'status' },
    ];

    csvContent = generateCsv(customers, columns);
  } else if (report === 'returns-warranty') {
    const dateFilter = buildDateFilter(req.query.range as string, req.query.dateFrom as string, req.query.dateTo as string, 'r.created_at');
    const returns = queryAll<any>(
      `SELECT r.return_no, s.invoice_no, c.name as customer_name, r.return_type,
              r.total_refund_amount, r.reason, r.created_at
       FROM returns r
       LEFT JOIN sales s ON r.sale_id = s.id
       LEFT JOIN customers c ON r.customer_id = c.id
       WHERE r.shop_id = ? AND ${dateFilter.sql}
       ORDER BY r.created_at DESC`,
      [shopId, ...dateFilter.params]
    );

    const columns: CsvColumn<any>[] = [
      { header: 'Return No', key: 'return_no' },
      { header: 'Invoice No', key: 'invoice_no' },
      { header: 'Customer', transform: (r) => r.customer_name || 'Walk-in Customer' },
      { header: 'Type', key: 'return_type' },
      { header: 'Refund Amount ($)', key: 'total_refund_amount' },
      { header: 'Reason', key: 'reason' },
      { header: 'Date', key: 'created_at' },
    ];

    csvContent = generateCsv(returns, columns);
  } else {
    throw new AppError(400, 'INVALID_REPORT_TYPE', `Export for report '${report}' is not supported.`);
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report}_report_${now}.csv"`);
  res.send(csvContent);
}

// -----------------------------------------------------------------------------
// 8. PDF EXPORT (A4 Landscape Report with Clean Layout)
// -----------------------------------------------------------------------------
export async function exportPdf(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const isAdmin = req.user!.role === 'SHOP_ADMIN';
  const report = (req.query.report as string || 'sales').toLowerCase();

  // Enforce role on sensitive reports
  if ((report === 'purchases' || report === 'profit') && !isAdmin) {
    throw new AppError(403, 'FORBIDDEN_ROLE', 'Only Shop Admin can export this report.');
  }

  // Get Shop Name for report header
  const shopRow = queryOne<any>('SELECT name FROM shops WHERE id = ?', [shopId]);
  const shopName = shopRow?.name || 'Mobile Phone Shop';
  const now = new Date().toISOString().slice(0, 10);

  let pdfBuffer: Buffer;

  if (report === 'sales') {
    const dateFilter = buildDateFilter(req.query.range as string, req.query.dateFrom as string, req.query.dateTo as string, 's.created_at');
    const summary = queryOne<any>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0.0) as rev, COALESCE(SUM(amount_paid), 0.0) as paid, COALESCE(SUM(balance_due), 0.0) as due
       FROM sales s
       WHERE s.shop_id = ? AND s.is_reversed = 0 AND ${dateFilter.sql}`,
      [shopId, ...dateFilter.params]
    );

    const sales = queryAll<any>(
      `SELECT invoice_no, customer_name, total_amount, amount_paid, balance_due, payment_status, created_at
       FROM sales s
       WHERE s.shop_id = ? AND s.is_reversed = 0 AND ${dateFilter.sql}
       ORDER BY s.created_at DESC LIMIT 24`,
      [shopId, ...dateFilter.params]
    );

    const pdfData: ReportPdfData = {
      reportTitle: 'Sales Transactions Report',
      shopName,
      dateRange: dateFilter.rangeLabel,
      summaryCards: [
        { label: 'Total Revenue', value: `$${(summary?.rev || 0).toFixed(2)}` },
        { label: 'Transactions', value: `${summary?.cnt || 0}` },
        { label: 'Cash Collected', value: `$${(summary?.paid || 0).toFixed(2)}` },
        { label: 'Receivables Due', value: `$${(summary?.due || 0).toFixed(2)}` },
      ],
      headers: ['Invoice No', 'Date', 'Customer', 'Total ($)', 'Paid ($)', 'Balance Due ($)', 'Status'],
      rows: sales.map((s) => [
        s.invoice_no,
        String(s.created_at).slice(0, 10),
        s.customer_name || 'Walk-in',
        `$${s.total_amount.toFixed(2)}`,
        `$${s.amount_paid.toFixed(2)}`,
        `$${s.balance_due.toFixed(2)}`,
        s.payment_status,
      ]),
    };

    pdfBuffer = generateReportPdf(pdfData);
  } else if (report === 'profit') {
    const dateFilter = buildDateFilter(req.query.range as string, req.query.dateFrom as string, req.query.dateTo as string, 's.created_at');
    const summary = queryOne<any>(
      `SELECT COALESCE(SUM(si.subtotal), 0.0) as rev,
              COALESCE(SUM(si.unit_cost * si.quantity), 0.0) as cogs,
              COALESCE(SUM(si.profit), 0.0) as profit
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE si.shop_id = ? AND s.is_reversed = 0 AND ${dateFilter.sql}`,
      [shopId, ...dateFilter.params]
    );

    const items = queryAll<any>(
      `SELECT s.invoice_no, s.created_at as sale_date, si.product_name, si.quantity,
              si.actual_price, si.unit_cost, si.subtotal, si.profit
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE si.shop_id = ? AND s.is_reversed = 0 AND ${dateFilter.sql}
       ORDER BY s.created_at DESC LIMIT 24`,
      [shopId, ...dateFilter.params]
    );

    const marginPct = summary?.rev > 0 ? ((summary.profit / summary.rev) * 100).toFixed(1) : '0.0';

    const pdfData: ReportPdfData = {
      reportTitle: 'Gross Profit & Margin Report',
      shopName,
      dateRange: dateFilter.rangeLabel,
      summaryCards: [
        { label: 'Total Revenue', value: `$${(summary?.rev || 0).toFixed(2)}` },
        { label: 'Total COGS', value: `$${(summary?.cogs || 0).toFixed(2)}` },
        { label: 'Gross Profit', value: `$${(summary?.profit || 0).toFixed(2)}` },
        { label: 'Gross Margin', value: `${marginPct}%` },
      ],
      headers: ['Invoice No', 'Date', 'Product', 'Qty', 'Sell Price ($)', 'Cost ($)', 'Subtotal ($)', 'Profit ($)'],
      rows: items.map((i) => [
        i.invoice_no,
        String(i.sale_date).slice(0, 10),
        i.product_name,
        String(i.quantity),
        `$${i.actual_price.toFixed(2)}`,
        `$${i.unit_cost.toFixed(2)}`,
        `$${i.subtotal.toFixed(2)}`,
        `$${i.profit.toFixed(2)}`,
      ]),
    };

    pdfBuffer = generateReportPdf(pdfData);
  } else if (report === 'customers') {
    const summary = queryOne<any>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(outstanding_balance), 0.0) as total_debt
       FROM customers
       WHERE shop_id = ? AND outstanding_balance > 0`,
      [shopId]
    );

    const debtors = queryAll<any>(
      `SELECT name, phone, cnic_masked, credit_limit, outstanding_balance, status
       FROM customers
       WHERE shop_id = ? AND outstanding_balance > 0
       ORDER BY outstanding_balance DESC LIMIT 24`,
      [shopId]
    );

    const pdfData: ReportPdfData = {
      reportTitle: 'Customer Debtors & Credit Report',
      shopName,
      dateRange: 'Active Customer Balances',
      summaryCards: [
        { label: 'Active Debtors', value: `${summary?.cnt || 0}` },
        { label: 'Total Outstanding Debt', value: `$${(summary?.total_debt || 0).toFixed(2)}` },
      ],
      headers: ['Customer Name', 'Phone', 'CNIC (Masked)', 'Credit Limit ($)', 'Outstanding Due ($)', 'Status'],
      rows: debtors.map((d) => [
        d.name,
        d.phone,
        d.cnic_masked || 'N/A',
        `$${d.credit_limit.toFixed(2)}`,
        `$${d.outstanding_balance.toFixed(2)}`,
        d.status,
      ]),
    };

    pdfBuffer = generateReportPdf(pdfData);
  } else if (report === 'inventory') {
    const phones = queryAll<any>(
      `SELECT brand, model, imei1, storage, condition, purchase_cost, selling_price, status
       FROM phone_inventory
       WHERE shop_id = ? AND status = 'IN_STOCK'
       ORDER BY created_at DESC LIMIT 24`,
      [shopId]
    );

    const accRow = queryOne<any>(
      `SELECT COALESCE(SUM(available_quantity), 0) as qty,
              COALESCE(SUM(CASE WHEN available_quantity <= min_stock_threshold THEN 1 ELSE 0 END), 0) as low_cnt
       FROM accessories WHERE shop_id = ?`,
      [shopId]
    );
    const phoneVal = queryOne<any>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(purchase_cost), 0.0) as val FROM phone_inventory WHERE shop_id = ? AND status = 'IN_STOCK'`,
      [shopId]
    );

    const summaryCards = [
      { label: 'Phones In Stock', value: `${phoneVal?.cnt || 0}` },
      { label: 'Accessory Units', value: `${accRow?.qty || 0}` },
      { label: 'Low Stock SKUs', value: `${accRow?.low_cnt || 0}` },
    ];
    if (isAdmin) {
      summaryCards.push({ label: 'Phone Stock Value', value: `$${(phoneVal?.val || 0).toFixed(2)}` });
    }

    const headers = isAdmin
      ? ['Brand & Model', 'IMEI 1', 'Storage', 'Cond.', 'Cost ($)', 'Retail ($)', 'Status']
      : ['Brand & Model', 'IMEI 1', 'Storage', 'Cond.', 'Retail ($)', 'Status'];

    const rows = phones.map((p) =>
      isAdmin
        ? [
            `${p.brand} ${p.model}`,
            p.imei1,
            p.storage || 'N/A',
            p.condition,
            `$${(p.purchase_cost || 0).toFixed(2)}`,
            `$${(p.selling_price || 0).toFixed(2)}`,
            p.status,
          ]
        : [
            `${p.brand} ${p.model}`,
            p.imei1,
            p.storage || 'N/A',
            p.condition,
            `$${(p.selling_price || 0).toFixed(2)}`,
            p.status,
          ]
    );

    pdfBuffer = generateReportPdf({
      reportTitle: 'Inventory Stock & Valuation Report',
      shopName,
      dateRange: `Snapshot ${now}`,
      summaryCards,
      headers,
      rows,
    });
  } else if (report === 'purchases') {
    const dateFilter = buildDateFilter(req.query.range as string, req.query.dateFrom as string, req.query.dateTo as string, 'p.purchase_date');
    const summary = queryOne<any>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0.0) as spend, COALESCE(SUM(tax_amount), 0.0) as tax
       FROM purchases p
       WHERE p.shop_id = ? AND ${dateFilter.sql}`,
      [shopId, ...dateFilter.params]
    );
    const purchases = queryAll<any>(
      `SELECT p.reference_no, p.purchase_date, p.status, p.tax_amount, p.total_amount, s.name as supplier_name
       FROM purchases p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.shop_id = ? AND ${dateFilter.sql}
       ORDER BY p.purchase_date DESC LIMIT 24`,
      [shopId, ...dateFilter.params]
    );

    pdfBuffer = generateReportPdf({
      reportTitle: 'Purchases & Supplier Inward Report',
      shopName,
      dateRange: dateFilter.rangeLabel,
      summaryCards: [
        { label: 'Total Orders', value: `${summary?.cnt || 0}` },
        { label: 'Total Spend', value: `$${(summary?.spend || 0).toFixed(2)}` },
        { label: 'Input Tax Paid', value: `$${(summary?.tax || 0).toFixed(2)}` },
      ],
      headers: ['PO Ref #', 'Date', 'Supplier', 'Tax ($)', 'Total Cost ($)', 'Status'],
      rows: purchases.map((p) => [
        p.reference_no,
        String(p.purchase_date).slice(0, 10),
        p.supplier_name || 'Direct',
        `$${(p.tax_amount || 0).toFixed(2)}`,
        `$${(p.total_amount || 0).toFixed(2)}`,
        p.status,
      ]),
    });
  } else if (report === 'returns-warranty') {
    const dateFilter = buildDateFilter(req.query.range as string, req.query.dateFrom as string, req.query.dateTo as string, 'r.created_at');
    const summary = queryOne<any>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(total_refund_amount), 0.0) as refunds
       FROM returns r
       WHERE r.shop_id = ? AND ${dateFilter.sql}`,
      [shopId, ...dateFilter.params]
    );
    const returns = queryAll<any>(
      `SELECT r.return_no, s.invoice_no, c.name as customer_name, r.return_type, r.total_refund_amount, r.reason, r.created_at
       FROM returns r
       LEFT JOIN sales s ON r.sale_id = s.id
       LEFT JOIN customers c ON r.customer_id = c.id
       WHERE r.shop_id = ? AND ${dateFilter.sql}
       ORDER BY r.created_at DESC LIMIT 24`,
      [shopId, ...dateFilter.params]
    );

    pdfBuffer = generateReportPdf({
      reportTitle: 'Returns, Exchanges & Warranty Report',
      shopName,
      dateRange: dateFilter.rangeLabel,
      summaryCards: [
        { label: 'Returns Processed', value: `${summary?.cnt || 0}` },
        { label: 'Total Refunded', value: `$${(summary?.refunds || 0).toFixed(2)}` },
      ],
      headers: ['Return #', 'Invoice #', 'Customer', 'Type', 'Refund ($)', 'Date'],
      rows: returns.map((r) => [
        r.return_no,
        r.invoice_no || 'N/A',
        r.customer_name || 'Walk-in',
        r.return_type,
        `$${(r.total_refund_amount || 0).toFixed(2)}`,
        String(r.created_at).slice(0, 10),
      ]),
    });
  } else {
    throw new AppError(400, 'INVALID_REPORT_TYPE', `PDF Export for '${report}' is not supported.`);
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${report}_report_${now}.pdf"`);
  res.send(pdfBuffer);
}
