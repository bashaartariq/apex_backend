import { Request, Response } from 'express';
import { queryAll, queryOne } from '../database/query';

// Admin Dashboard: Complete Business Overview with Real DB Aggregations
export async function getAdminDashboard(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;

  // 1. Summary Metrics
  // Today's Sales
  const todaySalesRow = queryOne<any>(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0.0) as revenue, COALESCE(SUM(gross_profit), 0.0) as profit
     FROM sales
     WHERE shop_id = ? AND is_reversed = 0 AND date(created_at) = date('now')`,
    [shopId]
  ) || { cnt: 0, revenue: 0, profit: 0 };

  // Today's Purchases
  const todayPurchasesRow = queryOne<any>(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0.0) as expenditure
     FROM purchases
     WHERE shop_id = ? AND status = 'CONFIRMED' AND date(purchase_date) = date('now')`,
    [shopId]
  ) || { cnt: 0, expenditure: 0 };

  // Current Month Sales & Gross Profit
  const monthSalesRow = queryOne<any>(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0.0) as revenue, COALESCE(SUM(gross_profit), 0.0) as profit
     FROM sales
     WHERE shop_id = ? AND is_reversed = 0 AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
    [shopId]
  ) || { cnt: 0, revenue: 0, profit: 0 };

  // Previous Month Sales (for comparison)
  const prevMonthSalesRow = queryOne<any>(
    `SELECT COALESCE(SUM(total_amount), 0.0) as revenue
     FROM sales
     WHERE shop_id = ? AND is_reversed = 0 AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', '-1 month')`,
    [shopId]
  ) || { revenue: 0 };

  // Inventory Valuation (Phones in stock: purchase_cost sum; Accessories: FIFO batches sum)
  const phoneValRow = queryOne<any>(
    `SELECT COUNT(*) as total_phones,
            SUM(CASE WHEN condition = 'NEW' THEN 1 ELSE 0 END) as new_phones,
            SUM(CASE WHEN condition = 'USED' THEN 1 ELSE 0 END) as used_phones,
            COALESCE(SUM(purchase_cost), 0.0) as phone_value
     FROM phone_inventory
     WHERE shop_id = ? AND status = 'IN_STOCK'`,
    [shopId]
  ) || { total_phones: 0, new_phones: 0, used_phones: 0, phone_value: 0 };

  const accValRow = queryOne<any>(
    `SELECT COALESCE(SUM(b.remaining_quantity * b.unit_cost), 0.0) as acc_value,
            COALESCE(SUM(b.remaining_quantity), 0) as acc_units
     FROM accessory_batches b
     WHERE b.shop_id = ? AND b.remaining_quantity > 0`,
    [shopId]
  ) || { acc_value: 0, acc_units: 0 };

  const lowStockRow = queryOne<any>(
    `SELECT COUNT(*) as low_count
     FROM accessories
     WHERE shop_id = ? AND status = 'ACTIVE' AND available_quantity <= min_stock_threshold`,
    [shopId]
  ) || { low_count: 0 };

  // Total Outstanding Customer Balances
  const debtorsRow = queryOne<any>(
    `SELECT COALESCE(SUM(outstanding_balance), 0.0) as total_debt,
            COUNT(CASE WHEN outstanding_balance > 0 THEN 1 END) as debtor_count
     FROM customers
     WHERE shop_id = ?`,
    [shopId]
  ) || { total_debt: 0, debtor_count: 0 };

  // 2. Sales Overview & Daily Trends (last 7 days)
  const dailyTrends = queryAll<any>(
    `SELECT date(created_at) as sale_date,
            COUNT(*) as transactions_count,
            COALESCE(SUM(total_amount), 0.0) as revenue,
            COALESCE(SUM(gross_profit), 0.0) as profit
     FROM sales
     WHERE shop_id = ? AND is_reversed = 0 AND date(created_at) >= date('now', '-7 days')
     GROUP BY date(created_at)
     ORDER BY date(created_at) ASC`,
    [shopId]
  );

  // Month-over-month growth percentage
  const currentMonthRevenue = monthSalesRow.revenue;
  const prevMonthRevenue = prevMonthSalesRow.revenue;
  let revenueGrowthPct = 0.0;
  if (prevMonthRevenue > 0) {
    revenueGrowthPct = Math.round(((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 1000) / 10;
  } else if (currentMonthRevenue > 0) {
    revenueGrowthPct = 100.0;
  }

  // 3. Business Activity Lists (Recent 5)
  const recentSales = queryAll<any>(
    `SELECT id, invoice_no, customer_name, total_amount, amount_paid, balance_due, payment_status, created_at
     FROM sales
     WHERE shop_id = ?
     ORDER BY created_at DESC LIMIT 5`,
    [shopId]
  );

  const recentPurchases = queryAll<any>(
    `SELECT p.id, p.reference_no as purchase_no, s.name as supplier_name, p.total_amount, p.status, p.purchase_date
     FROM purchases p
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE p.shop_id = ?
     ORDER BY p.created_at DESC LIMIT 5`,
    [shopId]
  );

  const recentReceipts = queryAll<any>(
    `SELECT r.id, r.receipt_no, s.invoice_no, c.name as customer_name, r.amount_received, r.payment_method, r.created_at
     FROM customer_payment_receipts r
     LEFT JOIN sales s ON r.sale_id = s.id
     LEFT JOIN customers c ON r.customer_id = c.id
     WHERE r.shop_id = ?
     ORDER BY r.created_at DESC LIMIT 5`,
    [shopId]
  );

  const recentReturns = queryAll<any>(
    `SELECT r.id, r.return_no, s.invoice_no, r.return_type, r.total_refund_amount, r.reason, r.created_at
     FROM returns r
     LEFT JOIN sales s ON r.sale_id = s.id
     WHERE r.shop_id = ?
     ORDER BY r.created_at DESC LIMIT 5`,
    [shopId]
  );

  // 4. Top Selling Products
  const topProducts = queryAll<any>(
    `SELECT item_type, product_name, SUM(quantity) as units_sold, SUM(subtotal) as total_revenue, SUM(profit) as total_profit
     FROM sale_items
     WHERE shop_id = ?
     GROUP BY item_type, product_name
     ORDER BY units_sold DESC LIMIT 6`,
    [shopId]
  );

  res.json({
    success: true,
    data: {
      summary: {
        todaySalesRevenue: todaySalesRow.revenue,
        todaySalesCount: todaySalesRow.cnt,
        todayPurchasesExpenditure: todayPurchasesRow.expenditure,
        todayPurchasesCount: todayPurchasesRow.cnt,
        monthlySalesRevenue: monthSalesRow.revenue,
        monthlyGrossProfit: monthSalesRow.profit,
        prevMonthSalesRevenue: prevMonthSalesRow.revenue,
        revenueGrowthPercentage: revenueGrowthPct,
        averageTransactionValue:
          todaySalesRow.cnt > 0 ? Math.round((todaySalesRow.revenue / todaySalesRow.cnt) * 100) / 100 : 0.0,
        totalInventoryValuation: Math.round((phoneValRow.phone_value + accValRow.acc_value) * 100) / 100,
        phoneInventoryValuation: Math.round(phoneValRow.phone_value * 100) / 100,
        accessoryInventoryValuation: Math.round(accValRow.acc_value * 100) / 100,
        phonesInStockCount: phoneValRow.total_phones,
        newPhonesCount: phoneValRow.new_phones,
        usedPhonesCount: phoneValRow.used_phones,
        accessoriesInStockUnits: accValRow.acc_units,
        lowStockAccessoriesCount: lowStockRow.low_count,
        totalCustomerReceivables: debtorsRow.total_debt,
        debtorsCount: debtorsRow.debtor_count,
      },
      dailyTrends: dailyTrends.map((d) => ({
        date: d.sale_date,
        transactionsCount: d.transactions_count,
        revenue: d.revenue,
        profit: d.profit,
      })),
      recentActivity: {
        sales: recentSales.map((s) => ({
          id: s.id,
          invoiceNo: s.invoice_no,
          customerName: s.customer_name,
          totalAmount: s.total_amount,
          amountPaid: s.amount_paid,
          balanceDue: s.balance_due,
          paymentStatus: s.payment_status,
          createdAt: s.created_at,
        })),
        purchases: recentPurchases.map((p) => ({
          id: p.id,
          purchaseNo: p.purchase_no,
          supplierName: p.supplier_name || 'Direct',
          totalAmount: p.total_amount,
          status: p.status,
          date: p.purchase_date,
        })),
        receipts: recentReceipts.map((r) => ({
          id: r.id,
          receiptNo: r.receipt_no,
          invoiceNo: r.invoice_no,
          customerName: r.customer_name || 'Customer',
          amountReceived: r.amount_received,
          paymentMethod: r.payment_method,
          createdAt: r.created_at,
        })),
        returns: recentReturns.map((rt) => ({
          id: rt.id,
          returnNo: rt.return_no,
          invoiceNo: rt.invoice_no,
          returnType: rt.return_type,
          refundAmount: rt.total_refund_amount,
          reason: rt.reason,
          createdAt: rt.created_at,
        })),
      },
      topSellingProducts: topProducts.map((tp) => ({
        itemType: tp.item_type,
        productName: tp.product_name,
        unitsSold: tp.units_sold,
        totalRevenue: tp.total_revenue,
        totalProfit: tp.total_profit,
      })),
    },
  });
}

// Shopkeeper Dashboard: Permitted operational information only (NO purchase costs or profit)
export async function getShopkeeperDashboard(req: Request, res: Response): Promise<void> {
  const shopId = req.user!.shopId;
  const userId = req.user!.id;

  // Today's Sales performed by this register / shop
  const todaySalesRow = queryOne<any>(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0.0) as revenue
     FROM sales
     WHERE shop_id = ? AND is_reversed = 0 AND date(created_at) = date('now')`,
    [shopId]
  ) || { cnt: 0, revenue: 0 };

  // Today's personal sales completed by this shopkeeper
  const myTodaySalesRow = queryOne<any>(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0.0) as revenue
     FROM sales
     WHERE shop_id = ? AND shopkeeper_id = ? AND is_reversed = 0 AND date(created_at) = date('now')`,
    [shopId, userId]
  ) || { cnt: 0, revenue: 0 };

  // Available stock count (without financial valuation)
  const phoneCountRow = queryOne<any>(
    `SELECT COUNT(*) as cnt
     FROM phone_inventory
     WHERE shop_id = ? AND status = 'IN_STOCK'`,
    [shopId]
  ) || { cnt: 0 };

  const accCountRow = queryOne<any>(
    `SELECT COALESCE(SUM(available_quantity), 0) as cnt
     FROM accessories
     WHERE shop_id = ? AND status = 'ACTIVE'`,
    [shopId]
  ) || { cnt: 0 };

  // Recent 5 sales by this shopkeeper
  const myRecentSales = queryAll<any>(
    `SELECT id, invoice_no, customer_name, total_amount, payment_status, created_at
     FROM sales
     WHERE shop_id = ? AND shopkeeper_id = ?
     ORDER BY created_at DESC LIMIT 5`,
    [shopId, userId]
  );

  res.json({
    success: true,
    data: {
      todayRegisterSales: todaySalesRow.revenue,
      todayRegisterTransactionsCount: todaySalesRow.cnt,
      myTodaySalesRevenue: myTodaySalesRow.revenue,
      myTodayTransactionsCount: myTodaySalesRow.cnt,
      availablePhonesCount: phoneCountRow.cnt,
      availableAccessoriesUnits: accCountRow.cnt,
      recentSales: myRecentSales.map((s) => ({
        id: s.id,
        invoiceNo: s.invoice_no,
        customerName: s.customer_name,
        totalAmount: s.total_amount,
        paymentStatus: s.payment_status,
        createdAt: s.created_at,
      })),
    },
  });
}
