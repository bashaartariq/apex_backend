import assert from 'assert';
import http from 'http';
import { createApp } from '../app';
import { queryOne } from '../database/query';
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
  console.log('--- Starting Step 4: POS, Sales & Customer Management Tests ---');

  // Seed DB first
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
    console.log('  ✓ Authentication tokens acquired');

    // 2. Customer Listing & Masked CNIC Verification
    const custListRes = await request('GET', '/customers', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(custListRes.data.success, true);
    assert(custListRes.data.data.length >= 3, 'Should have seeded customers');
    const usman = custListRes.data.data.find((c: any) => c.name === 'Usman Ali');
    assert(usman, 'Usman Ali should exist');
    assert(
      usman.cnicMasked === '42101-*******-1' || usman.cnicMasked === '42101-1234***-1',
      'CNIC must be masked in listing'
    );
    console.log('  ✓ Customer list returns properly masked CNIC');

    // 2b. Authorized CNIC Reveal Verification (Admin allowed, Staff forbidden)
    const revealAdminRes = await request('GET', `/customers/${usman.id}/reveal-cnic`, {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert.strictEqual(revealAdminRes.data.success, true);
    assert.strictEqual(revealAdminRes.data.data.cnic, '42101-1234567-1', 'Admin must be able to decrypt CNIC');

    const revealStaffRes = await request('GET', `/customers/${usman.id}/reveal-cnic`, {
      token: apexStaffToken,
      expectedStatus: 403,
    });
    assert.strictEqual(revealStaffRes.status, 403, 'Staff must be forbidden from revealing full CNIC');
    console.log('  ✓ CNIC reveal endpoint enforces strict Admin-only authorization');

    // 3. Register New Customer with Valid 13-digit CNIC (without requiring credit limit)
    const randCnic = `42201-${Math.floor(1000000 + Math.random() * 9000000)}-1`;
    const newCustRes = await request('POST', '/customers', {
      token: apexStaffToken,
      body: {
        name: 'Zubair Qureshi',
        phone: '0312-3456789',
        cnic: randCnic,
        email: 'zubair.q@example.com',
      },
      expectedStatus: 201,
    });
    assert.strictEqual(newCustRes.data.success, true);
    assert.strictEqual(newCustRes.data.data.creditLimit, 0, 'Credit limit defaults to 0 when omitted');
    const zubairId = newCustRes.data.data.id;
    console.log('  ✓ Staff can register customer with encrypted CNIC and simplified form (no credit limit needed)');

    // 4. Duplicate CNIC in same shop rejected
    const dupCnicRes = await request('POST', '/customers', {
      token: apexAdminToken,
      body: {
        name: 'Another Person',
        phone: '0311-0000000',
        cnic: randCnic,
      },
      expectedStatus: 409,
    });
    assert.strictEqual(dupCnicRes.status, 409, 'Duplicate CNIC in same shop must fail');
    console.log('  ✓ Duplicate CNIC rejected (409 Conflict)');

    // 5. Same CNIC in different shop tenant allowed
    const novaSameCnicRes = await request('POST', '/customers', {
      token: novaAdminToken,
      body: {
        name: 'Zubair in Nova',
        phone: '0312-3456789',
        cnic: randCnic,
      },
      expectedStatus: 201,
    });
    assert.strictEqual(novaSameCnicRes.status, 201, 'Same CNIC in different tenant shop is allowed');
    console.log('  ✓ Multi-tenancy allows identical CNIC across distinct shops');

    // 6. POS Live Catalog Search
    const posSearchRes = await request('GET', '/sales/pos/search?query=Apple', {
      token: apexStaffToken,
      expectedStatus: 200,
    });
    assert.strictEqual(posSearchRes.data.success, true);
    assert(posSearchRes.data.data.length > 0, 'Should find products for Apple');
    const firstPhone = posSearchRes.data.data.find((p: any) => p.itemType === 'PHONE');
    assert(firstPhone, 'Should find an in-stock phone');
    console.log('  ✓ POS Live Search returns in-stock phones and accessories');

    // 7. Instant Barcode / SKU / IMEI Lookup
    const lookupRes = await request('GET', `/products/lookup/${firstPhone.identifier}`, {
      token: apexStaffToken,
      expectedStatus: 200,
    });
    assert.strictEqual(lookupRes.data.success, true);
    assert.strictEqual(lookupRes.data.data.identifier, firstPhone.identifier);
    console.log('  ✓ Instant scan lookup finds product by IMEI');

    // 8. Register a fresh phone specifically for sale test
    const testImei = `3589${Math.floor(10000000000 + Math.random() * 90000000000)}`;
    const regPhoneRes = await request('POST', '/inventory/phones', {
      token: apexAdminToken,
      body: {
        brand: 'Samsung',
        model: 'Galaxy S24 Ultra',
        imei1: testImei,
        ram: '12',
        storage: '512',
        color: 'Titanium Gray',
        condition: 'NEW',
        purchaseCost: 950.0,
        sellingPrice: 1199.0,
      },
      expectedStatus: 201,
    });
    const testPhoneId = regPhoneRes.data.data.id;

    // 9. Phone sale without CNIC is rejected (400 CNIC_REQUIRED)
    const noCnicSaleRes = await request('POST', '/sales/checkout', {
      token: apexStaffToken,
      body: {
        customerName: 'Anonymous Buyer',
        items: [
          {
            itemType: 'PHONE',
            productId: testPhoneId,
            quantity: 1,
            actualPrice: 1199.0,
          },
        ],
        payments: [{ paymentMethod: 'CASH', amount: 1199.0 }],
      },
      expectedStatus: 400,
    });
    assert.strictEqual(noCnicSaleRes.status, 400);
    assert.strictEqual(noCnicSaleRes.data.error.code, 'CNIC_REQUIRED');
    console.log('  ✓ Phone sale without CNIC rejected (400 CNIC_REQUIRED)');

    // 10. Accessory-only sale without CNIC succeeds
    const accListRes = await request('GET', '/sales/pos/search?type=ACCESSORY', {
      token: apexStaffToken,
      expectedStatus: 200,
    });
    const testAcc = accListRes.data.data[0];
    assert(testAcc, 'Should have test accessory');

    const accOnlySaleRes = await request('POST', '/sales/checkout', {
      token: apexStaffToken,
      body: {
        customerName: 'Walk-in Retail Customer',
        items: [
          {
            itemType: 'ACCESSORY',
            productId: testAcc.id,
            quantity: 2,
            actualPrice: testAcc.defaultPrice,
          },
        ],
        payments: [{ paymentMethod: 'CASH', amount: testAcc.defaultPrice * 2 * 1.05 }],
      },
      expectedStatus: 201,
    });
    assert.strictEqual(accOnlySaleRes.data.success, true);
    console.log('  ✓ Accessory-only sale without CNIC succeeds');

    // 11. Staff sale with below-default price without approval rejected
    const unapprovedDiscRes = await request('POST', '/sales/checkout', {
      token: apexStaffToken,
      body: {
        customerId: zubairId,
        customerName: 'Zubair Qureshi',
        items: [
          {
            itemType: 'PHONE',
            productId: testPhoneId,
            quantity: 1,
            actualPrice: 1050.0, // Default is 1199.0
          },
        ],
        payments: [{ paymentMethod: 'CASH', amount: 1050.0 }],
      },
      expectedStatus: 400,
    });
    if (unapprovedDiscRes.data.error.code !== 'DISCOUNT_APPROVAL_REQUIRED') {
      console.error('unapprovedDiscRes error details:', unapprovedDiscRes.data.error);
    }
    assert.strictEqual(unapprovedDiscRes.data.error.code, 'DISCOUNT_APPROVAL_REQUIRED');
    console.log('  ✓ Selling below default price without approval rejected for staff');

    // 12. Discount Request & Admin Approval Workflow
    const discReqRes = await request('POST', '/discounts/request', {
      token: apexStaffToken,
      body: {
        itemType: 'PHONE',
        productId: testPhoneId,
        productName: 'Samsung Galaxy S24 Ultra',
        defaultPrice: 1199.0,
        requestedPrice: 1050.0,
        reason: 'Customer requested price match with local retail promotion',
      },
      expectedStatus: 201,
    });
    const discReqId = discReqRes.data.data.id;

    // Admin approves discount
    const approveDiscRes = await request('POST', `/discounts/${discReqId}/review`, {
      token: apexAdminToken,
      body: { action: 'APPROVE', approvedAmount: 149.0 },
      expectedStatus: 200,
    });
    assert.strictEqual(approveDiscRes.data.data.status, 'APPROVED');
    console.log('  ✓ Discount approval workflow completed');

    // 13. Split Payment Checkout with Approved Discount
    const splitSaleRes = await request('POST', '/sales/checkout', {
      token: apexStaffToken,
      body: {
        customerId: zubairId,
        customerName: 'Zubair Qureshi',
        customerPhone: '0312-3456789',
        customerCnic: randCnic,
        items: [
          {
            itemType: 'PHONE',
            productId: testPhoneId,
            quantity: 1,
            actualPrice: 1050.0,
            discountRequestId: discReqId,
            warrantyMonths: 12,
          },
        ],
        payments: [
          { paymentMethod: 'CASH', amount: 500.0 },
          { paymentMethod: 'CARD', amount: 300.0, transactionReference: 'TXN-CARD-9912' },
          { paymentMethod: 'BANK_TRANSFER', amount: 302.5, transactionReference: 'HBL-004128' }, // 1050 * 1.05 = 1102.50
        ],
      },
      expectedStatus: 201,
    });
    assert.strictEqual(splitSaleRes.data.success, true);
    assert.strictEqual(splitSaleRes.data.data.paymentStatus, 'PAID');
    assert.strictEqual(splitSaleRes.data.data.balanceDue, 0);
    const completedSale = splitSaleRes.data.data;
    console.log(`  ✓ Split payment sale completed with invoice ${completedSale.invoiceNo}`);

    // 14. Verify Phone is now SOLD and cannot be sold again
    const phoneAfter = queryOne<any>(`SELECT status FROM phone_inventory WHERE id = ?`, [testPhoneId]);
    assert.strictEqual(phoneAfter.status, 'SOLD', 'Phone status must be SOLD');

    const resoldPhoneRes = await request('POST', '/sales/checkout', {
      token: apexAdminToken,
      body: {
        customerId: zubairId,
        customerName: 'Zubair Qureshi',
        items: [
          {
            itemType: 'PHONE',
            productId: testPhoneId,
            quantity: 1,
            actualPrice: 1199.0,
          },
        ],
      },
      expectedStatus: 400,
    });
    assert.strictEqual(resoldPhoneRes.data.error.code, 'PHONE_NOT_IN_STOCK');
    console.log('  ✓ Reselling already SOLD phone rejected atomically');

    // 15. Credit Sale within Customer Credit Limit
    const creditSaleRes = await request('POST', '/sales/checkout', {
      token: apexAdminToken,
      body: {
        customerId: zubairId,
        customerName: 'Zubair Qureshi',
        items: [
          {
            itemType: 'ACCESSORY',
            productId: testAcc.id,
            quantity: 5,
            actualPrice: testAcc.defaultPrice,
          },
        ],
        payments: [
          { paymentMethod: 'CASH', amount: 20.0 }, // partial payment
        ],
      },
      expectedStatus: 201,
    });
    assert.strictEqual(creditSaleRes.data.data.paymentStatus, 'PARTIALLY_PAID');
    assert(creditSaleRes.data.data.balanceDue > 0);
    const creditSaleId = creditSaleRes.data.data.id;
    console.log('  ✓ Credit sale creates invoice with balance due');

    // 16. Customer Balance Updated
    const zubairCustRes = await request('GET', `/customers/${zubairId}`, {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert(zubairCustRes.data.data.outstandingBalance > 0);
    console.log(`  ✓ Customer outstanding balance reflects unpaid debt ($${zubairCustRes.data.data.outstandingBalance})`);

    // 17. Subsequent Payment Collection on Credit Invoice
    const payRes = await request('POST', `/payments/sales/${creditSaleId}/payments`, {
      token: apexStaffToken,
      body: {
        paymentMethod: 'JAZZCASH',
        amount: creditSaleRes.data.data.balanceDue,
        transactionReference: 'JC-88231',
        notes: 'Full balance settled via mobile wallet',
      },
      expectedStatus: 201,
    });
    assert.strictEqual(payRes.data.success, true);
    assert.strictEqual(payRes.data.data.paymentStatus, 'PAID');
    assert.strictEqual(payRes.data.data.remainingBalance, 0);
    assert(payRes.data.data.receiptNo.startsWith('REC-'));
    const receiptId = payRes.data.data.id;
    console.log(`  ✓ Debt payment collected; Receipt ${payRes.data.data.receiptNo} generated`);

    // 18. Customer Statement reflects sales and receipts
    const stmtRes = await request('GET', `/customers/${zubairId}/statement`, {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert(stmtRes.data.data.sales.length >= 2);
    assert(stmtRes.data.data.receipts.length >= 1);
    console.log('  ✓ Customer financial statement accurately lists sales and payment receipts');

    // 19. Binary PDF Generation for Invoice & Receipt
    const invoicePdfRes = await request('GET', `/sales/${completedSale.id}/invoice/pdf`, {
      token: apexStaffToken,
      expectedStatus: 200,
    });
    assert.strictEqual(invoicePdfRes.headers.get('content-type'), 'application/pdf');
    assert(Buffer.isBuffer(invoicePdfRes.data) && invoicePdfRes.data.length > 500);
    assert(invoicePdfRes.data.toString('ascii', 0, 5) === '%PDF-');
    console.log('  ✓ Invoice PDF generated binary buffer with valid %PDF- header');

    const receiptPdfRes = await request('GET', `/payments/receipts/${receiptId}/pdf`, {
      token: apexStaffToken,
      expectedStatus: 200,
    });
    assert.strictEqual(receiptPdfRes.headers.get('content-type'), 'application/pdf');
    assert(Buffer.isBuffer(receiptPdfRes.data) && receiptPdfRes.data.length > 400);
    console.log('  ✓ Receipt PDF generated binary buffer');

    // 20. Warranty Claim Workflow
    const warrListRes = await request('GET', '/warranty', {
      token: apexAdminToken,
      expectedStatus: 200,
    });
    assert(warrListRes.data.data.length > 0);
    const warrRecord = warrListRes.data.data.find((w: any) => w.identifier === testImei);
    assert(warrRecord, 'Warranty record should exist for sold test phone');

    const claimRes = await request('POST', '/warranty/claims', {
      token: apexAdminToken,
      body: {
        warrantyId: warrRecord.id,
        problemDescription: 'Display touch unresponsive in bottom-left corner',
      },
      expectedStatus: 201,
    });
    assert.strictEqual(claimRes.data.success, true);
    assert.strictEqual(claimRes.data.data.status, 'REGISTERED');
    const claimId = claimRes.data.data.id;

    // Check phone status set to UNDER_REPAIR
    const phRepair = queryOne<any>(`SELECT status FROM phone_inventory WHERE id = ?`, [testPhoneId]);
    assert.strictEqual(phRepair.status, 'UNDER_REPAIR', 'Phone should be marked UNDER_REPAIR');
    console.log('  ✓ Warranty claim registered and phone marked UNDER_REPAIR');

    // Update claim to REPAIRED and DELIVERED
    const updateClaimRes = await request('PUT', `/warranty/claims/${claimId}`, {
      token: apexAdminToken,
      body: {
        status: 'DELIVERED',
        repairNotes: 'Replaced digitizer flex cable; display test passed',
        partsUsed: 'Flex cable #F88',
        laborCost: 15.0,
      },
      expectedStatus: 200,
    });
    assert.strictEqual(updateClaimRes.data.data.status, 'DELIVERED');
    console.log('  ✓ Warranty claim updated and resolved');

    // 21. Multi-Tenant Data Isolation Test
    const novaViewApexSaleRes = await request('GET', `/sales/${completedSale.id}`, {
      token: novaAdminToken,
      expectedStatus: 404,
    });
    assert.strictEqual(novaViewApexSaleRes.status, 404, 'Nova tenant cannot view Apex sale');

    const novaViewApexCustomerRes = await request('GET', `/customers/${zubairId}`, {
      token: novaAdminToken,
      expectedStatus: 404,
    });
    assert.strictEqual(novaViewApexCustomerRes.status, 404, 'Nova tenant cannot view Apex customer');
    console.log('  ✓ Strict multi-tenant isolation enforced for sales and customers');

    console.log('\n--- All Step 4 Backend Tests Passed Successfully! ---');
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
