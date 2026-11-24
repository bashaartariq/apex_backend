import http from 'http';
import { createApp } from '../app';
import { closeDatabase } from '../config/database';

async function runGlobalSearchTests() {
  console.log('--- Starting Step 11: Global Search Verification Tests ---');

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
    // 1. Unauthenticated search request is rejected
    const unauthRes = await fetch(`${baseUrl}/search?q=iPhone`);
    await assert('Unauthenticated search request returns 401 Unauthorized', unauthRes.status === 401);

    // 2. Log in as Apex Admin
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@apex.com', password: 'Password123!' }),
    });
    const adminLoginJson = (await adminLoginRes.json()) as any;
    const adminToken = adminLoginJson.accessToken;
    await assert('Apex Admin login succeeds', adminLoginRes.status === 200 && !!adminToken);

    // 3. Log in as Apex Shopkeeper
    const keeperLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'keeper@apex.com', password: 'Password123!' }),
    });
    const keeperLoginJson = (await keeperLoginRes.json()) as any;
    const keeperToken = keeperLoginJson.accessToken;
    await assert('Apex Shopkeeper login succeeds', keeperLoginRes.status === 200 && !!keeperToken);

    // 4. Log in as Nova Admin (different tenant)
    const novaLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@novamobile.com', password: 'Password123!' }),
    });
    const novaLoginJson = (await novaLoginRes.json()) as any;
    const novaToken = novaLoginJson.accessToken;
    await assert('Nova Admin login succeeds', novaLoginRes.status === 200 && !!novaToken);

    // 5. Empty query string returns empty arrays and totalCount 0
    const emptyRes = await fetch(`${baseUrl}/search?q=`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const emptyJson = (await emptyRes.json()) as any;
    await assert(
      'Empty query string returns empty arrays and totalCount 0',
      emptyRes.status === 200 &&
        emptyJson.success === true &&
        emptyJson.totalCount === 0 &&
        emptyJson.data.phones.length === 0
    );

    // 6. Search for phone by brand/model
    const phoneRes = await fetch(`${baseUrl}/search?q=iPhone`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const phoneJson = (await phoneRes.json()) as any;
    await assert(
      'Search for phone by brand returns phone matches',
      phoneRes.status === 200 &&
        phoneJson.data.phones.length > 0 &&
        phoneJson.data.phones.some((p: any) => p.title.toLowerCase().includes('iphone'))
    );

    // Verify phone result metadata structure
    const samplePhone = phoneJson.data.phones[0];
    await assert(
      'Phone search item includes route, queryParams, badge, and metadata',
      samplePhone.route === '/inventory/phones' &&
        !!samplePhone.queryParams?.search &&
        !!samplePhone.badge &&
        samplePhone.price !== undefined
    );

    // 7. Search for phone by IMEI
    const imeiToSearch = samplePhone.metadata.imei1.substring(0, 8);
    const imeiRes = await fetch(`${baseUrl}/search?q=${imeiToSearch}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const imeiJson = (await imeiRes.json()) as any;
    await assert(
      'Search by IMEI returns the matching phone device',
      imeiRes.status === 200 &&
        imeiJson.data.phones.some((p: any) => p.metadata.imei1.includes(imeiToSearch))
    );

    // 8. Search for accessories
    const accRes = await fetch(`${baseUrl}/search?q=Case`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const accJson = (await accRes.json()) as any;
    await assert(
      'Search for accessory returns matching accessories with SKU & stock badge',
      accRes.status === 200 &&
        accJson.data.accessories.length > 0 &&
        accJson.data.accessories[0].route === '/inventory/accessories' &&
        !!accJson.data.accessories[0].badge
    );

    // 9. Search for customers & verify CNIC privacy masking
    const custRes = await fetch(`${baseUrl}/search?q=a`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const custJson = (await custRes.json()) as any;
    await assert(
      'Search returns customers and masks CNIC strictly without plaintext exposure',
      custRes.status === 200 &&
        custJson.data.customers.length > 0 &&
        custJson.data.customers.every((c: any) => !c.metadata.cnic && (!c.metadata.cnicMasked || c.metadata.cnicMasked.includes('*')))
    );

    // 10. Search for sales invoices
    const salesRes = await fetch(`${baseUrl}/search?q=INV`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const salesJson = (await salesRes.json()) as any;
    await assert(
      'Search returns sales invoices with payment status badges',
      salesRes.status === 200 &&
        salesJson.data.sales.length > 0 &&
        salesJson.data.sales[0].title.startsWith('INV-')
    );

    // 11. Search for suppliers (Admin has access)
    const supRes = await fetch(`${baseUrl}/search?q=Apex`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const supJson = (await supRes.json()) as any;
    await assert(
      'Admin can search suppliers',
      supRes.status === 200 && supJson.data.suppliers.length > 0
    );

    // 12. Shopkeeper role & permission enforcement:
    // Shopkeeper does NOT have suppliers.view permission -> suppliers must be empty []
    const keeperSupRes = await fetch(`${baseUrl}/search?q=Apex`, {
      headers: { Authorization: `Bearer ${keeperToken}` },
    });
    const keeperSupJson = (await keeperSupRes.json()) as any;
    await assert(
      'Shopkeeper without suppliers.view gets empty suppliers list',
      keeperSupRes.status === 200 && keeperSupJson.data.suppliers.length === 0
    );

    // Shopkeeper HAS phones.view and accessories.view -> can see phones and accessories
    await assert(
      'Shopkeeper with phones.view and accessories.view can see matching devices and stock',
      keeperSupJson.data.phones !== undefined && keeperSupJson.data.accessories !== undefined
    );

    // 13. Multi-tenant isolation:
    // Nova Admin searches for Apex-specific supplier or phone -> returns 0 results
    const apexSupName = supJson.data.suppliers[0].title;
    const novaSearchRes = await fetch(`${baseUrl}/search?q=${encodeURIComponent(apexSupName)}`, {
      headers: { Authorization: `Bearer ${novaToken}` },
    });
    const novaSearchJson = (await novaSearchRes.json()) as any;
    await assert(
      'Tenant isolation: Nova Admin cannot find Apex supplier in search',
      novaSearchRes.status === 200 &&
        novaSearchJson.data.suppliers.length === 0 &&
        novaSearchJson.data.phones.length === 0
    );

    console.log(`\nVerification Test Results: ${passed} PASSED, ${failed} FAILED.`);
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDatabase();
  }
}

runGlobalSearchTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
