import http from 'http';
import { createApp } from '../app';
import { closeDatabase, getDatabase } from '../config/database';

async function runTests() {
  console.log('--- Starting Step 3: Inventory & Purchasing Verification Tests ---');

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
      console.error(`  ✗ FAIL: ${desc}`, detail || '');
      failed++;
    }
  }

  try {
    // 1. Authenticate users
    const apexAdminRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@apex.com', password: 'Password123!' }),
    });
    const apexAdminData = (await apexAdminRes.json()) as any;
    const apexAdminToken = apexAdminData.accessToken;
    const apexShopId = apexAdminData.shop.id;

    const apexStaffRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'keeper@apex.com', password: 'Password123!' }),
    });
    const apexStaffData = (await apexStaffRes.json()) as any;
    const apexStaffToken = apexStaffData.accessToken;

    const novaAdminRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@novamobile.com', password: 'Password123!' }),
    });
    const novaAdminData = (await novaAdminRes.json()) as any;
    const novaAdminToken = novaAdminData.accessToken;
    const novaShopId = novaAdminData.shop.id;

    await assert('Apex Admin authenticated', !!apexAdminToken);
    await assert('Apex Staff authenticated', !!apexStaffToken);
    await assert('Nova Admin authenticated', !!novaAdminToken);

    // 2. Suppliers
    const suppliersRes = await fetch(`${baseUrl}/suppliers`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const suppliersJson = (await suppliersRes.json()) as any;
    await assert('Apex Admin can list suppliers', suppliersRes.status === 200 && suppliersJson.data.length >= 3);

    const testSupplierRes = await fetch(`${baseUrl}/suppliers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        name: 'Omni Telecom Distributors',
        contactPerson: 'David Miller',
        phone: '+1-555-888-9999',
        email: 'david@omnitelecom.test',
        address: '777 Logistics Blvd, Suite 100',
      }),
    });
    const testSupplierJson = (await testSupplierRes.json()) as any;
    await assert('Apex Admin can create new supplier', testSupplierRes.status === 201 && !!testSupplierJson.data.id);
    const newSupplierId = testSupplierJson.data.id;

    // RBAC: Staff cannot create supplier
    const staffSupRes = await fetch(`${baseUrl}/suppliers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexStaffToken}`,
      },
      body: JSON.stringify({
        name: 'Unauthorized Supplier',
        phone: '1234567890',
      }),
    });
    await assert('Shopkeeper is forbidden from creating supplier', staffSupRes.status === 403);

    // Tenant Isolation: Nova cannot see Apex supplier
    const novaSupRes = await fetch(`${baseUrl}/suppliers/${newSupplierId}`, {
      headers: { Authorization: `Bearer ${novaAdminToken}` },
    });
    await assert('Tenant 2 cannot access Tenant 1 supplier (404/Isolated)', novaSupRes.status === 404);

    // 3. Categories & Accessories
    const categoriesRes = await fetch(`${baseUrl}/inventory/accessories/categories`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const categoriesJson = (await categoriesRes.json()) as any;
    await assert('Categories listed successfully', categoriesRes.status === 200 && categoriesJson.data.length > 0);
    const testCategoryId = categoriesJson.data[0].id;

    const uniqueSku = 'TEST-SKU-' + Date.now();
    const createAccRes = await fetch(`${baseUrl}/inventory/accessories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        categoryId: testCategoryId,
        supplierId: newSupplierId,
        name: 'Ultra Slim Case 16 Pro',
        brand: 'Spigen',
        model: 'iPhone 16 Pro',
        sku: uniqueSku,
        barcode: '880999000111',
        purchaseCost: 12.5,
        sellingPrice: 29.99,
        initialQuantity: 15,
        minStockThreshold: 5,
        description: 'Matte black case',
      }),
    });
    const createAccJson = (await createAccRes.json()) as any;
    await assert('Apex Admin can create accessory with initial FIFO batch', createAccRes.status === 201 && !!createAccJson.data.id);
    const newAccId = createAccJson.data.id;

    // Duplicate SKU in same shop rejected
    const dupSkuRes = await fetch(`${baseUrl}/inventory/accessories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        categoryId: testCategoryId,
        name: 'Duplicate SKU Item',
        brand: 'Generic',
        sku: uniqueSku,
        purchaseCost: 10,
        sellingPrice: 20,
        initialQuantity: 5,
        minStockThreshold: 2,
      }),
    });
    await assert('Duplicate SKU in same shop is rejected (409 Conflict)', dupSkuRes.status === 409);

    // Cross-tenant duplicate SKU is allowed
    const novaCategoriesRes = await fetch(`${baseUrl}/inventory/accessories/categories`, {
      headers: { Authorization: `Bearer ${novaAdminToken}` },
    });
    const novaCategoriesJson = (await novaCategoriesRes.json()) as any;
    const novaCategoryId = novaCategoriesJson.data[0].id;

    const novaDupSkuRes = await fetch(`${baseUrl}/inventory/accessories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${novaAdminToken}`,
      },
      body: JSON.stringify({
        categoryId: novaCategoryId,
        name: 'Cross Tenant Same SKU Item',
        brand: 'Generic',
        sku: uniqueSku,
        purchaseCost: 10,
        sellingPrice: 20,
        initialQuantity: 5,
        minStockThreshold: 2,
      }),
    });
    await assert('Same SKU in different tenant is allowed', novaDupSkuRes.status === 201);

    // 4. Phones & Unique IMEI
    const testImei1 = '3548911029' + Math.floor(10000 + Math.random() * 90000);
    const createPhoneRes = await fetch(`${baseUrl}/inventory/phones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        brand: 'Apple',
        model: 'iPhone 16 Pro Max',
        imei1: testImei1,
        ram: '8GB',
        storage: '256GB',
        color: 'Natural Titanium',
        condition: 'NEW',
        purchaseCost: 950.0,
        sellingPrice: 1199.0,
        supplierId: newSupplierId,
        purchaseDate: new Date().toISOString().slice(0, 10),
      }),
    });
    const createPhoneJson = (await createPhoneRes.json()) as any;
    await assert('Apex Admin can register single phone with unique IMEI', createPhoneRes.status === 201 && !!createPhoneJson.data.id);
    const newPhoneId = createPhoneJson.data.id;

    // Test exact snake_case user payload
    const userPayloadImei = '12345' + Math.floor(1000000000 + Math.random() * 9000000000);
    const userPayloadRes = await fetch(`${baseUrl}/inventory/phones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        brand: 'Apple',
        model: 'IPHONE 16',
        imei1: userPayloadImei,
        imei2: '',
        ram: '8',
        storage: '256',
        color: 'Titanium',
        condition: 'USED',
        purchase_cost: 10.24,
        selling_price: 12.19,
        supplier_id: '',
        battery_health: 10,
        physical_condition: '',
        accessories_included: '',
        status: 'IN_STOCK',
        description: '',
      }),
    });
    const userPayloadJson = (await userPayloadRes.json()) as any;
    await assert(
      'User snake_case payload with purchase_cost, selling_price and empty supplier_id succeeds',
      userPayloadRes.status === 201 && !!userPayloadJson.data.id && userPayloadJson.data.imei1 === userPayloadImei
    );

    // Duplicate IMEI in same shop rejected
    const dupPhoneRes = await fetch(`${baseUrl}/inventory/phones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        brand: 'Apple',
        model: 'iPhone 16 Pro Max Clone',
        imei1: testImei1,
        condition: 'NEW',
        purchaseCost: 900,
        sellingPrice: 1150,
      }),
    });
    await assert('Duplicate IMEI in same shop rejected (409 Conflict)', dupPhoneRes.status === 409);

    // Cross-tenant duplicate IMEI allowed
    const novaDupPhoneRes = await fetch(`${baseUrl}/inventory/phones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${novaAdminToken}`,
      },
      body: JSON.stringify({
        brand: 'Apple',
        model: 'Nova Phone Same IMEI',
        imei1: testImei1,
        condition: 'NEW',
        purchaseCost: 900,
        sellingPrice: 1150,
      }),
    });
    await assert('Same IMEI in different shop is allowed', novaDupPhoneRes.status === 201);

    // Lookup IMEI
    const lookupRes = await fetch(`${baseUrl}/inventory/phones/lookup/${testImei1}`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const lookupJson = (await lookupRes.json()) as any;
    await assert('IMEI lookup finds registered phone', lookupRes.status === 200 && lookupJson.data.id === newPhoneId);

    // 5. Purchases Module: Multi-Product Intake
    const poImei = '3599881122' + Math.floor(10000 + Math.random() * 90000);
    const poRef = 'PO-TEST-' + Date.now();
    const createPoRes = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        supplierId: newSupplierId,
        referenceNo: poRef,
        purchaseDate: new Date().toISOString().slice(0, 10),
        notes: 'Bulk stock arrival batch 102',
        items: [
          {
            itemType: 'PHONE',
            name: 'Samsung Galaxy S24 FE',
            brand: 'Samsung',
            model: 'Galaxy S24 FE',
            imei1: poImei,
            ram: '8GB',
            storage: '128GB',
            color: 'Mint',
            condition: 'NEW',
            quantity: 1,
            unitCost: 500.0,
            sellingPrice: 650.0,
          },
          {
            itemType: 'ACCESSORY',
            accessoryId: newAccId,
            name: 'Ultra Slim Case 16 Pro',
            quantity: 20,
            unitCost: 11.0,
          },
        ],
      }),
    });
    const createPoJson = (await createPoRes.json()) as any;
    await assert('Apex Admin can create draft purchase order', createPoRes.status === 201 && !!createPoJson.data.id);
    const poId = createPoJson.data.id;

    // Confirm purchase atomically
    const confirmPoRes = await fetch(`${baseUrl}/purchases/${poId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const confirmPoJson = (await confirmPoRes.json()) as any;
    await assert('Purchase confirmation completes atomically', confirmPoRes.status === 200 && confirmPoJson.success === true);

    // Verify phone from PO is now IN_STOCK
    const poPhoneLookup = await fetch(`${baseUrl}/inventory/phones/lookup/${poImei}`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const poPhoneJson = (await poPhoneLookup.json()) as any;
    await assert('Phone from PO confirmed and in stock', poPhoneLookup.status === 200 && poPhoneJson.data.status === 'IN_STOCK');

    // Verify accessory stock incremented (initial 15 + PO 20 = 35)
    const accDetailRes = await fetch(`${baseUrl}/inventory/accessories/${newAccId}`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const accDetailJson = (await accDetailRes.json()) as any;
    await assert('Accessory stock incremented with multiple FIFO batches', accDetailJson.data.available_quantity === 35 && accDetailJson.data.batches.length >= 2);

    // 6. Manual Stock Adjustments
    const adjRes = await fetch(`${baseUrl}/inventory/adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        itemType: 'ACCESSORY',
        productId: newAccId,
        newQuantity: 30, // reduction by 5
        reason: '5 units damaged during unboxing inspection',
      }),
    });
    const adjJson = (await adjRes.json()) as any;
    await assert('Manual stock adjustment succeeds with mandatory reason', adjRes.status === 200 && !!adjJson.adjustmentId);

    // Verify stock is now 30
    const accAfterAdj = await fetch(`${baseUrl}/inventory/accessories/${newAccId}`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const accAfterAdjJson = (await accAfterAdj.json()) as any;
    await assert('Accessory stock reflects reduction to 30', accAfterAdjJson.data.available_quantity === 30);

    // RBAC: Staff cannot adjust stock
    const staffAdjRes = await fetch(`${baseUrl}/inventory/adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexStaffToken}`,
      },
      body: JSON.stringify({
        itemType: 'ACCESSORY',
        productId: newAccId,
        newQuantity: 20,
        reason: 'Unauthorized change',
      }),
    });
    await assert('Shopkeeper cannot perform manual stock adjustment (403 Forbidden)', staffAdjRes.status === 403);

    // 7. Stock Movements Audit Log
    const movementsRes = await fetch(`${baseUrl}/inventory/movements`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const movementsJson = (await movementsRes.json()) as any;
    await assert('Stock movements audit log captures adjustments and purchases', movementsRes.status === 200 && movementsJson.data.length >= 3);

    // 8. Stock-Taking Session Workflow
    const createStRes = await fetch(`${baseUrl}/stock-takes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        title: 'Weekly Physical Audit Q4',
        notes: 'Verifying warehouse and front counter',
        scope: 'ALL',
      }),
    });
    const createStJson = (await createStRes.json()) as any;
    await assert('Admin can initiate stock-taking session', createStRes.status === 201 && !!createStJson.data.id);
    const stId = createStJson.data.id;

    // Get session items
    const stDetailRes = await fetch(`${baseUrl}/stock-takes/${stId}`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const stDetailJson = (await stDetailRes.json()) as any;
    await assert('Stock take session populates inventory items for counting', stDetailRes.status === 200 && stDetailJson.data.items.length > 0);

    // Update physical count with discrepancy
    const firstItem = stDetailJson.data.items[0];
    const updateCountRes = await fetch(`${baseUrl}/stock-takes/${stId}/counts`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            id: firstItem.id,
            countedQuantity: firstItem.expected_quantity + 2, // surplus of 2
            discrepancyReason: 'Found two misplaced boxes on top shelf',
            verified: true,
          },
        ],
      }),
    });
    await assert('Staff/Admin can record physical counts and save progress', updateCountRes.status === 200);

    // Finalize stock-take
    const finalizeStRes = await fetch(`${baseUrl}/stock-takes/${stId}/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    await assert('Admin can finalize stock-taking session and reconcile inventory', finalizeStRes.status === 200);

    // 9. Overall Stock Summary & Valuation
    const summaryRes = await fetch(`${baseUrl}/inventory/stock-summary`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const summaryJson = (await summaryRes.json()) as any;
    await assert(
      'Stock summary calculates phones and accessories FIFO valuation accurately',
      summaryRes.status === 200 &&
      summaryJson.data.phones.totalInStock > 0 &&
      summaryJson.data.accessories.totalQuantity > 0 &&
      summaryJson.data.totalInventoryValuation > 0
    );

    // 10. Multi-Tenant Stock Summary Isolation
    const novaSummaryRes = await fetch(`${baseUrl}/inventory/stock-summary`, {
      headers: { Authorization: `Bearer ${novaAdminToken}` },
    });
    const novaSummaryJson = (await novaSummaryRes.json()) as any;
    await assert(
      'Nova Tenant stock summary is strictly isolated from Apex',
      novaSummaryRes.status === 200 &&
      novaSummaryJson.data.phones.totalInStock !== summaryJson.data.phones.totalInStock
    );

  } catch (err: any) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    server.close();
    closeDatabase();
    console.log(`\nTests Completed: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runTests();
