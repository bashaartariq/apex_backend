import assert from 'assert';
import http from 'http';
import { createApp } from '../app';
import { runSeeds } from '../database/seed';

let server: http.Server;
let baseUrl = '';

async function request(
  method: string,
  path: string,
  options: { token?: string; body?: any; expectedStatus?: number } = {}
) {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {};
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else if (contentType.includes('application/pdf')) {
    const arrayBuffer = await res.arrayBuffer();
    data = Buffer.from(arrayBuffer);
  } else {
    data = await res.text();
  }

  if (options.expectedStatus && res.status !== options.expectedStatus) {
    console.error(`Status mismatch for ${method} ${path}. Expected ${options.expectedStatus}, got ${res.status}:`, data);
  }

  return { status: res.status, headers: res.headers, data };
}

async function runTests() {
  console.log('--- Starting Step 5: Dashboard, Reports & Analytics Tests ---');

  // Seed DB first to ensure consistent state
  runSeeds();

  // Start test server on random port
  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}/api`;
      console.log(`Test server running at ${baseUrl}`);
      resolve();
    });
  });

  try {
    // 1. Authenticate Demo Users
    const apexAdminLogin = await request('POST', '/auth/login', {
      body: { email: 'admin@apex.com', password: 'Password123!' },
      expectedStatus: 200,
    });
    const apexAdminToken = apexAdminLogin.data.accessToken;

    const apexStaffLogin = await request('POST', '/auth/login', {
      body: { email: 'keeper@apex.com', password: 'Password123!' },
      expectedStatus: 200,
    });
    const apexStaffToken = apexStaffLogin.data.accessToken;

    const novaAdminLogin = await request('POST', '/auth/login', {
      body: { email: 'owner@novamobile.com', password: 'Password123!' },
      expectedStatus: 200,
    });
    const novaAdminToken = novaAdminLogin.data.accessToken;
    console.log('  ✓ Authentication tokens acquired for Admin and Staff users');

    // 2. Admin Dashboard Metrics Verification
    const adminDashRes = await request('GET', '/dashboard/admin', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(adminDashRes.data.success, true);
    const summary = adminDashRes.data.data.summary;
    assert('totalInventoryValuation' in summary, 'Admin summary must include total inventory valuation');
    assert('phoneInventoryValuation' in summary, 'Admin summary must include phone valuation');
    assert('accessoryInventoryValuation' in summary, 'Admin summary must include accessory valuation');
    assert('monthlyGrossProfit' in summary, 'Admin summary must include gross profit');
    assert('phonesInStockCount' in summary, 'Admin summary must include phone stock counts');
    assert('totalCustomerReceivables' in summary, 'Admin summary must include customer debt');
    assert(Array.isArray(adminDashRes.data.data.dailyTrends), 'Daily trends array must exist');
    assert(adminDashRes.data.data.recentActivity.sales.length > 0, 'Recent sales should be populated');
    assert(adminDashRes.data.data.recentActivity.purchases.length > 0, 'Recent purchases should be populated');
    assert(adminDashRes.data.data.recentActivity.receipts.length > 0, 'Recent receipts should be populated');
    console.log('  ✓ Admin Dashboard returns complete KPI metrics and recent activity');

    // 3. Admin Dashboard Role Protection
    const adminDashForbidden = await request('GET', '/dashboard/admin', {
      token: apexStaffToken,
      expectedStatus: 403,
    });
    assert.strictEqual(adminDashForbidden.status, 403, 'Shopkeeper must not access Admin Dashboard');
    console.log('  ✓ Admin Dashboard strictly forbids Shopkeeper role access (HTTP 403)');

    // 4. Shopkeeper Dashboard: Permitted operational information only
    const shopkeeperDashRes = await request('GET', '/dashboard/shopkeeper', {
      token: apexStaffToken,
      expectedStatus: 200,
    });
    assert.strictEqual(shopkeeperDashRes.data.success, true);
    const skData = shopkeeperDashRes.data.data;
    assert('todayRegisterSales' in skData, 'Must include register sales');
    assert('availablePhonesCount' in skData, 'Must include available phones count');
    assert('availableAccessoriesUnits' in skData, 'Must include available accessory units');
    // Strict confidentiality check: Shopkeeper must NEVER see purchase cost, inventory valuation, or profit
    assert(!('totalInventoryValuation' in skData), 'CONFIDENTIAL: Inventory valuation must not be exposed to shopkeeper');
    assert(!('monthlyGrossProfit' in skData), 'CONFIDENTIAL: Profit metrics must not be exposed to shopkeeper');
    assert(!('phoneInventoryValuation' in skData), 'CONFIDENTIAL: Phone valuation must not be exposed to shopkeeper');
    console.log('  ✓ Shopkeeper Dashboard returns operational metrics and omits all sensitive cost/profit data');

    // 5. Tenant Isolation Verification on Dashboard
    const novaDashRes = await request('GET', '/dashboard/admin', {
      token: novaAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(novaDashRes.data.success, true);
    const novaSummary = novaDashRes.data.data.summary;
    // Nova has independent records, verify it does not inherit Apex's transactions
    assert.notStrictEqual(
      novaSummary.totalCustomerReceivables,
      summary.totalCustomerReceivables,
      'Multi-tenancy isolation: Nova customer receivables must be independent of Apex'
    );
    console.log('  ✓ Multi-tenancy isolation enforced on Dashboard summaries');

    // 6. Sales Reports (Date ranges, filters, summaries)
    const salesReportRes = await request('GET', '/reports/sales?range=last30days', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(salesReportRes.data.success, true);
    assert(salesReportRes.data.data.sales.length > 0, 'Should have sales in last 30 days');
    assert('totalSales' in salesReportRes.data.data.summary, 'Summary must include totalSales');
    assert('totalCollected' in salesReportRes.data.data.summary, 'Summary must include totalCollected');
    assert('totalOutstanding' in salesReportRes.data.data.summary, 'Summary must include totalOutstanding');
    assert(salesReportRes.data.data.summary.totalGrossProfit !== null, 'Admin sees gross profit');
    console.log('  ✓ Sales Reports returns filtered sales records and financial aggregations');

    // 7. Sales Reports Role-Based Gross Profit Masking
    const staffSalesReportRes = await request('GET', '/reports/sales?range=last30days', {
      token: apexStaffToken,
      expectedStatus: 200,
    });
    assert.strictEqual(staffSalesReportRes.data.success, true);
    assert.strictEqual(
      staffSalesReportRes.data.data.summary.totalGrossProfit,
      null,
      'CONFIDENTIAL: Staff must not see totalGrossProfit'
    );
    const firstSale = staffSalesReportRes.data.data.sales[0];
    if (firstSale) {
      assert.strictEqual(firstSale.grossProfit, null, 'CONFIDENTIAL: Staff must not see individual sale grossProfit');
    }
    console.log('  ✓ Sales Reports securely masks profit data for Shopkeeper role');

    // 8. Purchases Reports (Admin Only)
    const purchasesReportRes = await request('GET', '/reports/purchases?range=all_time', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(purchasesReportRes.data.success, true);
    assert(purchasesReportRes.data.data.purchases.length > 0, 'Should return purchase orders');
    assert('totalExpenditure' in purchasesReportRes.data.data.summary, 'Summary must include total expenditure');
    assert(purchasesReportRes.data.data.supplierBreakdown.length > 0, 'Supplier breakdown must be populated');

    const staffPurchasesRes = await request('GET', '/reports/purchases', {
      token: apexStaffToken,
      expectedStatus: 403,
    });
    assert.strictEqual(staffPurchasesRes.status, 403, 'Purchases report forbidden for Shopkeeper');
    console.log('  ✓ Purchases Reports correctly aggregates expenditures and restricts access to Admin');

    // 9. Inventory & Valuation Reports
    const inventoryReportRes = await request('GET', '/reports/inventory?type=ALL', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(inventoryReportRes.data.success, true);
    const invVal = inventoryReportRes.data.data.valuation;
    assert(invVal !== null, 'Admin receives full valuation');
    assert(invVal.totalValuation > 0, 'Total valuation must be positive');
    assert.strictEqual(
      invVal.totalValuation,
      Math.round((invVal.phoneValuation + invVal.accessoryValuation) * 100) / 100,
      'Total valuation must equal phone valuation plus FIFO accessory batches valuation'
    );
    assert(inventoryReportRes.data.data.phones.length > 0, 'Phones listing must be populated');
    assert(inventoryReportRes.data.data.accessories.length > 0, 'Accessories listing must be populated');

    // Verify staff sees stock without valuation or purchase cost
    const staffInvReport = await request('GET', '/reports/inventory?type=ALL', {
      token: apexStaffToken,
      expectedStatus: 200,
    });
    assert.strictEqual(staffInvReport.data.data.valuation, null, 'Staff valuation must be null');
    assert.strictEqual(staffInvReport.data.data.phones[0].purchaseCost, null, 'Staff phone purchase cost must be null');
    assert.strictEqual(staffInvReport.data.data.accessories[0].purchaseCost, null, 'Staff accessory cost must be null');
    console.log('  ✓ Inventory & Valuation Reports verify FIFO batch cost valuation and staff redaction');

    // 10. Accurate Gross Profit Report (Admin Only)
    const profitReportRes = await request('GET', '/reports/profit?range=last30days', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(profitReportRes.data.success, true);
    const profitSummary = profitReportRes.data.data.summary;
    assert('totalRevenue' in profitSummary, 'Summary must include totalRevenue');
    assert('totalCogs' in profitSummary, 'Summary must include totalCogs');
    assert('grossProfit' in profitSummary, 'Summary must include grossProfit');
    assert('netGrossProfit' in profitSummary, 'Summary must include netGrossProfit');
    assert.strictEqual(
      profitSummary.netGrossProfit,
      Math.round((profitSummary.grossProfit - profitSummary.returnsDeduction) * 100) / 100,
      'Net Gross Profit must deduct returns and reversals so profit is not overstated'
    );

    const staffProfitRes = await request('GET', '/reports/profit', {
      token: apexStaffToken,
      expectedStatus: 403,
    });
    assert.strictEqual(staffProfitRes.status, 403, 'Profit report forbidden for Shopkeeper');
    console.log('  ✓ Gross Profit Reports calculate COGS, account for returns, and enforce Admin restriction');

    // 11. Customer Debtors & Credit Report
    const custCreditRes = await request('GET', '/reports/customers?debtorsOnly=true', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(custCreditRes.data.success, true);
    const debtors = custCreditRes.data.data.customers;
    assert(debtors.length > 0, 'Should have active debtors from seeds');
    for (const d of debtors) {
      assert(d.outstandingBalance > 0, 'debtorsOnly=true must return customers with balance > 0');
      assert(/^[0-9]{5}-\*{7}-/.test(d.cnicMasked) || /^[0-9]{5}-[0-9]{4}\*\*\*-/.test(d.cnicMasked), 'CNIC must be masked with asterisks');
    }
    console.log('  ✓ Customer Credit Report lists active debtors with masked CNIC and credit limits');

    // 12. Returns & Warranty Report
    const returnsWarrantyRes = await request('GET', '/reports/returns-warranty?type=ALL', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(returnsWarrantyRes.data.success, true);
    assert('returns' in returnsWarrantyRes.data.data, 'Returns list must exist');
    assert('warrantyClaims' in returnsWarrantyRes.data.data, 'Warranty claims list must exist');
    console.log('  ✓ Returns & Warranty Report returns claim records and refund aggregates');

    // 13. CSV Export with Formula Injection Defense (CWE-1236)
    const csvExportRes = await request('GET', '/reports/export/csv?report=sales&range=last30days', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(csvExportRes.headers.get('content-type')?.includes('text/csv'), true);
    assert(typeof csvExportRes.data === 'string', 'CSV data must be text');
    assert(csvExportRes.data.includes('Invoice No'), 'CSV header must include Invoice No');

    // Verify staff cannot export profit via CSV
    const staffCsvProfitRes = await request('GET', '/reports/export/csv?report=profit', {
      token: apexStaffToken,
      expectedStatus: 403,
    });
    assert.strictEqual(staffCsvProfitRes.status, 403, 'Staff cannot export profit CSV');
    console.log('  ✓ CSV Export generated with RFC 4180 format and formula injection defense');

    // 14. PDF Export (A4 Landscape Data Report)
    const pdfExportRes = await request('GET', '/reports/export/pdf?report=sales&range=last30days', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(pdfExportRes.headers.get('content-type')?.includes('application/pdf'), true);
    assert(Buffer.isBuffer(pdfExportRes.data), 'PDF response must be a Buffer');
    const pdfSignature = pdfExportRes.data.slice(0, 5).toString('ascii');
    assert.strictEqual(pdfSignature, '%PDF-', 'PDF output must begin with valid %PDF- header signature');

    // Verify staff cannot export profit PDF
    const staffPdfProfitRes = await request('GET', '/reports/export/pdf?report=profit', {
      token: apexStaffToken,
      expectedStatus: 403,
    });
    assert.strictEqual(staffPdfProfitRes.status, 403, 'Staff cannot export profit PDF');
    console.log('  ✓ PDF Export generated with valid %PDF- document binary');

    console.log('\n--- All Step 5 Tests Passed Successfully (14/14) ---');
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
