import http from 'http';
import { createApp } from '../app';
import { closeDatabase } from '../config/database';

async function runValidationFormattingTests() {
  console.log('--- Starting Step 12: Application-Wide Validation & Formatting Tests ---');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  console.log(`Test server running at ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  async function assert(desc: string, condition: boolean | Promise<boolean>, detail?: any) {
    const result = await condition;
    if (result) {
      console.log(`  ✓ ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      if (detail) console.error('    Detail:', JSON.stringify(detail));
      failed++;
    }
  }

  async function apiRequest(
    method: string,
    endpoint: string,
    options: { token?: string; body?: any; rawBody?: string; headers?: Record<string, string> } = {}
  ) {
    const headers: Record<string, string> = { ...options.headers };
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }
    if (options.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body:
        options.rawBody !== undefined
          ? options.rawBody
          : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
    });

    const contentType = res.headers.get('content-type') || '';
    let json: any = null;
    let text = '';
    if (contentType.includes('application/json')) {
      json = await res.json();
    } else {
      text = await res.text();
    }

    return { status: res.status, json, text };
  }

  try {
    // Authenticate Admin
    const adminLogin = await apiRequest('POST', '/auth/login', {
      body: { email: 'admin@apex.com', password: 'Password123!' },
    });
    const adminToken = adminLogin.json?.accessToken;
    await assert('Admin authentication succeeds', adminLogin.status === 200 && !!adminToken, adminLogin);

    // Authenticate Shopkeeper
    const keeperLogin = await apiRequest('POST', '/auth/login', {
      body: { email: 'keeper@apex.com', password: 'Password123!' },
    });
    const keeperToken = keeperLogin.json?.accessToken;
    await assert('Shopkeeper authentication succeeds', keeperLogin.status === 200 && !!keeperToken, keeperLogin);

    // TEST 1: Empty required fields
    const emptyPhoneRes = await apiRequest('POST', '/inventory/phones', {
      token: adminToken,
      body: { brand: '', model: '', imei1: '' },
    });
    await assert(
      'Test 1: Empty required fields in phone rejected with fieldErrors',
      emptyPhoneRes.status === 400 &&
        !!emptyPhoneRes.json?.error?.fieldErrors?.brand &&
        !!emptyPhoneRes.json?.error?.fieldErrors?.imei1,
      emptyPhoneRes
    );

    const emptySupplierRes = await apiRequest('POST', '/suppliers', {
      token: adminToken,
      body: { name: '', phone: '' },
    });
    await assert(
      'Test 1b: Empty required fields in supplier rejected with fieldErrors',
      emptySupplierRes.status === 400 &&
        !!emptySupplierRes.json?.error?.fieldErrors?.name &&
        !!emptySupplierRes.json?.error?.fieldErrors?.phone,
      emptySupplierRes
    );

    // TEST 2: Invalid email addresses
    const invalidEmailCustomer = await apiRequest('POST', '/customers', {
      token: adminToken,
      body: { name: 'Email Test Customer', phone: '03001234567', email: 'not-an-email-at-all' },
    });
    await assert(
      'Test 2: Invalid customer email format rejected with 400',
      invalidEmailCustomer.status === 400 &&
        invalidEmailCustomer.json?.error?.fieldErrors?.email !== undefined,
      invalidEmailCustomer
    );

    // TEST 3: Invalid CNIC values (<13 digits, non-numeric)
    const invalidCnicCustomer = await apiRequest('POST', '/customers', {
      token: adminToken,
      body: { name: 'CNIC Test Customer', phone: '03001234567', cnic: '12345-abc' },
    });
    await assert(
      'Test 3: Non-numeric / short CNIC rejected with 400 and friendly message',
      invalidCnicCustomer.status === 400 &&
        invalidCnicCustomer.json?.error?.fieldErrors?.cnic !== undefined,
      invalidCnicCustomer
    );

    // TEST 4 & 5: CNIC entry with and without hyphens, paste & normalization
    // Pakistani CNIC is 13 digits (e.g. 5 digits + 7 digits + 1 digit = 13)
    const uniqueSevenA = Math.floor(1000000 + Math.random() * 9000000).toString();
    const raw13Cnic = `35201${uniqueSevenA}1`;
    const createCustomerRawCnic = await apiRequest('POST', '/customers', {
      token: adminToken,
      body: {
        name: 'Raw CNIC Customer',
        phone: '03007654321',
        cnic: raw13Cnic,
      },
    });
    await assert(
      'Test 4: Raw 13-digit CNIC accepted and saved',
      createCustomerRawCnic.status === 201 &&
        createCustomerRawCnic.json?.data?.id !== undefined,
      createCustomerRawCnic
    );

    const uniqueSevenB = Math.floor(1000000 + Math.random() * 9000000).toString();
    const formattedHyphenCnic = `35202-${uniqueSevenB}-2`;
    const createCustomerHyphenCnic = await apiRequest('POST', '/customers', {
      token: adminToken,
      body: {
        name: 'Hyphen CNIC Customer',
        phone: '03007654322',
        cnic: formattedHyphenCnic,
      },
    });
    await assert(
      'Test 5: Formatted hyphenated CNIC accepted and saved',
      createCustomerHyphenCnic.status === 201 &&
        createCustomerHyphenCnic.json?.data?.id !== undefined,
      createCustomerHyphenCnic
    );

    // TEST 6: Valid and invalid phone numbers
    const invalidPhoneCustomer = await apiRequest('POST', '/customers', {
      token: adminToken,
      body: { name: 'Bad Phone Cust', phone: '12' },
    });
    await assert(
      'Test 6: Short/invalid phone number rejected with 400',
      invalidPhoneCustomer.status === 400 &&
        invalidPhoneCustomer.json?.error?.fieldErrors?.phone !== undefined,
      invalidPhoneCustomer
    );

    // TEST 7: Negative prices and quantities
    const negPricePhone = await apiRequest('POST', '/inventory/phones', {
      token: adminToken,
      body: {
        brand: 'Apple',
        model: 'iPhone 15 Pro',
        imei1: `35987109${Math.floor(1000000 + Math.random() * 9000000)}`,
        purchase_cost: -500,
        selling_price: -100,
      },
    });
    await assert(
      'Test 7: Negative purchase cost and selling price rejected with 400',
      negPricePhone.status === 400 &&
        negPricePhone.json?.error?.fieldErrors?.purchaseCost !== undefined,
      negPricePhone
    );

    // Retrieve active category for accessories
    const catRes = await apiRequest('GET', '/inventory/accessories/categories', { token: adminToken });
    const sampleCatId = catRes.json?.data?.[0]?.id || 'cat_chargers';

    const negQtyAccessory = await apiRequest('POST', '/inventory/accessories', {
      token: adminToken,
      body: {
        name: 'Test Cable',
        categoryId: sampleCatId,
        brand: 'Anker',
        sku: `SKU-NEG-${Math.floor(10000 + Math.random() * 90000)}`,
        purchaseCost: 5,
        sellingPrice: 15,
        initialQuantity: -10,
      },
    });
    await assert(
      'Test 7b: Negative accessory quantity rejected with 400',
      negQtyAccessory.status === 400 &&
        negQtyAccessory.json?.error?.fieldErrors?.initialQuantity !== undefined,
      negQtyAccessory
    );

    // TEST 8: Invalid discount values / requested price
    const negDiscountRes = await apiRequest('POST', '/discounts/request', {
      token: keeperToken,
      body: {
        itemType: 'ACCESSORY',
        productId: 'acc-1',
        productName: 'Sample Product',
        defaultPrice: 100,
        requestedPrice: -20,
        reason: 'Price discount',
      },
    });
    await assert(
      'Test 8: Negative requested price for discount rejected with 400',
      negDiscountRes.status === 400,
      negDiscountRes
    );

    // TEST 9: Invalid dates
    const customerId = createCustomerRawCnic.json?.data?.id || 'cust-1';
    const invalidDateSale = await apiRequest('POST', '/sales/checkout', {
      token: adminToken,
      body: {
        customerId,
        customerName: 'Raw CNIC Customer',
        items: [
          {
            itemType: 'ACCESSORY',
            productId: 'acc-1',
            quantity: 1,
            actualPrice: 10,
          },
        ],
        payments: [{ paymentMethod: 'CASH', amount: 10 }],
        dueDate: 'invalid-not-a-date',
      },
    });
    await assert(
      'Test 9: Invalid date rejected with 400',
      invalidDateSale.status === 400 &&
        invalidDateSale.json?.error?.fieldErrors?.dueDate !== undefined,
      invalidDateSale
    );

    // TEST 10: Duplicate records
    // 10a: Duplicate IMEI
    const imeiTestVal = `86542109${Math.floor(1000000 + Math.random() * 9000000)}`;
    const phoneA = await apiRequest('POST', '/inventory/phones', {
      token: adminToken,
      body: {
        brand: 'Samsung',
        model: 'Galaxy S24',
        imei1: imeiTestVal,
        purchase_cost: 600,
        selling_price: 850,
      },
    });
    await assert('Test 10a: Initial phone with unique IMEI creates successfully', phoneA.status === 201, phoneA);

    const phoneB = await apiRequest('POST', '/inventory/phones', {
      token: adminToken,
      body: {
        brand: 'Samsung',
        model: 'Galaxy S24 Ultra',
        imei1: imeiTestVal,
        purchase_cost: 700,
        selling_price: 950,
      },
    });
    await assert(
      'Test 10a-2: Duplicate IMEI returns HTTP 409 with friendly error message',
      phoneB.status === 409 &&
        phoneB.json?.error?.message?.includes('already registered') &&
        !phoneB.json?.error?.message?.includes('SQLITE_'),
      phoneB
    );

    // 10b: Duplicate SKU
    const skuTestVal = `SKU-DUP-${Math.floor(10000 + Math.random() * 90000)}`;
    const accA = await apiRequest('POST', '/inventory/accessories', {
      token: adminToken,
      body: {
        name: 'Fast Charger 65W',
        categoryId: sampleCatId,
        brand: 'Anker',
        sku: skuTestVal,
        purchaseCost: 15,
        sellingPrice: 35,
        initialQuantity: 20,
      },
    });
    await assert('Test 10b: Initial accessory creates successfully', accA.status === 201, accA);

    const accB = await apiRequest('POST', '/inventory/accessories', {
      token: adminToken,
      body: {
        name: 'Another Fast Charger',
        categoryId: sampleCatId,
        brand: 'Anker',
        sku: skuTestVal,
        purchaseCost: 15,
        sellingPrice: 35,
        initialQuantity: 10,
      },
    });
    await assert(
      'Test 10b-2: Duplicate SKU returns HTTP 409 with friendly error message',
      accB.status === 409 &&
        accB.json?.error?.message?.includes('already exists') &&
        !accB.json?.error?.message?.includes('SQLITE_'),
      accB
    );

    // 10c: Duplicate Customer CNIC in same tenant
    const dupCnicCustomer = await apiRequest('POST', '/customers', {
      token: adminToken,
      body: {
        name: 'Duplicate CNIC User',
        phone: '03001112233',
        cnic: formattedHyphenCnic,
      },
    });
    await assert(
      'Test 10c: Duplicate CNIC returns HTTP 409 with friendly customer message',
      dupCnicCustomer.status === 409 &&
        dupCnicCustomer.json?.error?.message?.includes('already registered in this shop'),
      dupCnicCustomer
    );

    // 10d: Duplicate User Email
    const dupEmailUser = await apiRequest('POST', '/users', {
      token: adminToken,
      body: {
        name: 'Duplicate Email Staff',
        email: 'admin@apex.com', // Already taken by admin!
        password: 'Password123!',
        role: 'SHOPKEEPER',
      },
    });
    await assert(
      'Test 10d: Duplicate user email returns HTTP 409 with friendly message',
      dupEmailUser.status === 409 &&
        dupEmailUser.json?.error?.message?.includes('already exists'),
      dupEmailUser
    );

    // TEST 11: Backend validation when bypassing Angular
    const directRestBypass = await apiRequest('POST', '/customers', {
      token: adminToken,
      body: {
        name: '',
        phone: 'invalid',
        cnic: '123',
        email: 'bad-email',
      },
    });
    await assert(
      'Test 11: Direct REST call bypassing frontend is stopped by backend Zod validation',
      directRestBypass.status === 400 &&
        directRestBypass.json?.error?.code === 'VALIDATION_ERROR' &&
        Object.keys(directRestBypass.json?.error?.fieldErrors || {}).length >= 3,
      directRestBypass
    );

    // TEST 12: Network failures / Malformed JSON payload
    const malformedJsonRes = await apiRequest('POST', '/customers', {
      token: adminToken,
      rawBody: '{"name": "Malformed JSON, missing closing brace',
      headers: { 'Content-Type': 'application/json' },
    });
    await assert(
      'Test 12: Malformed JSON body returns HTTP 400 with user-friendly error',
      malformedJsonRes.status === 400 &&
        malformedJsonRes.json?.error?.code === 'INVALID_JSON',
      malformedJsonRes
    );

    // TEST 13: Unauthorized requests (no token / invalid token)
    const noTokenRes = await apiRequest('GET', '/customers');
    await assert(
      'Test 13a: Missing authentication returns HTTP 401 with friendly message',
      noTokenRes.status === 401 &&
        noTokenRes.json?.error?.message?.includes('credentials are required'),
      noTokenRes
    );

    const badTokenRes = await apiRequest('GET', '/customers', {
      token: 'not-a-valid-jwt-token-string',
    });
    await assert(
      'Test 13b: Invalid session token returns HTTP 401 with friendly message',
      badTokenRes.status === 401 &&
        badTokenRes.json?.error?.message?.includes('Invalid or tampered'),
      badTokenRes
    );

    // TEST 14: Insufficient stock during sales checkout
    const checkoutExcessStockRes = await apiRequest('POST', '/sales/checkout', {
      token: adminToken,
      body: {
        customerId,
        customerName: 'Raw CNIC Customer',
        items: [
          {
            itemType: 'ACCESSORY',
            productId: 'acc_apex_001',
            quantity: 99999, // Way more than the 20 in stock!
            actualPrice: 35,
          },
        ],
        payments: [{ paymentMethod: 'CASH', amount: 3499965 }],
      },
    });
    await assert(
      'Test 14: Insufficient stock returns exact user-friendly message',
      checkoutExcessStockRes.status === 400 &&
        checkoutExcessStockRes.json?.error?.message === "There isn't enough stock available for this sale.",
      checkoutExcessStockRes
    );

    // TEST 15: Create and edit operations
    const editCustomerRes = await apiRequest('PUT', `/customers/${customerId}`, {
      token: adminToken,
      body: {
        name: 'Updated Name Customer',
        phone: '03009988776',
        email: 'updated@example.com',
      },
    });
    await assert(
      'Test 15: Edit customer performs proper validation and updates',
      editCustomerRes.status === 200 &&
        editCustomerRes.json?.data?.name === 'Updated Name Customer',
      editCustomerRes
    );

    const editCustomerBadEmail = await apiRequest('PUT', `/customers/${customerId}`, {
      token: adminToken,
      body: {
        email: 'bad-format-again',
      },
    });
    await assert(
      'Test 15b: Edit customer rejects invalid update with fieldErrors',
      editCustomerBadEmail.status === 400 &&
        editCustomerBadEmail.json?.error?.fieldErrors?.email !== undefined,
      editCustomerBadEmail
    );

    // TEST 16: Admin vs Shopkeeper role permissions
    const keeperUpdateShop = await apiRequest('PUT', '/shop/profile', {
      token: keeperToken,
      body: {
        name: 'Unauthorized Shopkeeper Rename',
        phone: '0300-1122334',
        address: '123 New Address',
      },
    });
    await assert(
      'Test 16: Shopkeeper unauthorized store edit returns HTTP 403 Forbidden',
      keeperUpdateShop.status === 403 &&
        keeperUpdateShop.json?.error?.code === 'FORBIDDEN_ROLE',
      keeperUpdateShop
    );

    console.log(`\nValidation & Formatting Test Results: ${passed} passed, ${failed} failed.`);
  } finally {
    server.close();
    closeDatabase();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runValidationFormattingTests().catch((err) => {
  console.error('Unhandled error in validation formatting tests:', err);
  process.exit(1);
});
