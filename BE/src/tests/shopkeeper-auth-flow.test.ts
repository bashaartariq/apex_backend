import http from 'http';
import { createApp } from '../app';
import { closeDatabase, getDatabase } from '../config/database';

async function runStep09Tests() {
  console.log('--- Starting Step 09: Shopkeeper Authentication Flow & Stability Tests ---');

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
    // 1. Admin login verification
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@apex.com', password: 'Password123!' }),
    });
    const adminLoginJson = (await adminLoginRes.json()) as any;
    await assert(
      '1. Admin login succeeds with SHOP_ADMIN role and all permissions',
      adminLoginRes.status === 200 &&
        adminLoginJson.user.role === 'SHOP_ADMIN' &&
        Array.isArray(adminLoginJson.user.permissions) &&
        adminLoginJson.user.permissions.length >= 20
    );
    const adminToken = adminLoginJson.accessToken;

    // 2. Standard Shopkeeper login verification
    const keeperLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'keeper@apex.com', password: 'Password123!' }),
    });
    const keeperLoginJson = (await keeperLoginRes.json()) as any;
    await assert(
      '2. Shopkeeper login succeeds with SHOPKEEPER role and filtered permissions',
      keeperLoginRes.status === 200 &&
        keeperLoginJson.user.role === 'SHOPKEEPER' &&
        Array.isArray(keeperLoginJson.user.permissions) &&
        keeperLoginJson.user.permissions.includes('pos.access') &&
        keeperLoginJson.user.permissions.includes('dashboard.view') &&
        !keeperLoginJson.user.permissions.includes('users.manage')
    );
    const keeperToken = keeperLoginJson.accessToken;

    // 3. Create Shopkeeper with LIMITED permissions (pos.access only)
    const limitedKeeperEmail = `cashier_${Date.now()}@apex.com`;
    const createLimitedRes = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Express Cashier',
        email: limitedKeeperEmail,
        password: 'Password123!',
        phone: '555-0199',
        role: 'SHOPKEEPER',
        permissions: ['pos.access'],
      }),
    });
    const createLimitedJson = (await createLimitedRes.json()) as any;
    await assert('3. Admin can create limited Shopkeeper with pos.access only', createLimitedRes.status === 201);

    // 4. Limited Shopkeeper Login
    const limitedLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: limitedKeeperEmail, password: 'Password123!' }),
    });
    const limitedLoginJson = (await limitedLoginRes.json()) as any;
    await assert(
      '4. Limited Shopkeeper login succeeds with exactly one assigned permission',
      limitedLoginRes.status === 200 &&
        limitedLoginJson.user.permissions.length === 1 &&
        limitedLoginJson.user.permissions[0] === 'pos.access'
    );
    const limitedToken = limitedLoginJson.accessToken;

    // 5. Limited Shopkeeper access to restricted dashboard
    const limitedDashRes = await fetch(`${baseUrl}/dashboard/shopkeeper`, {
      headers: { Authorization: `Bearer ${limitedToken}` },
    });
    await assert(
      '5. Limited Shopkeeper lacking dashboard.view receives 403 Forbidden',
      limitedDashRes.status === 403
    );

    // 6. Shopkeeper with dashboard.view accessing shopkeeper dashboard
    const standardDashRes = await fetch(`${baseUrl}/dashboard/shopkeeper`, {
      headers: { Authorization: `Bearer ${keeperToken}` },
    });
    await assert(
      '6. Standard Shopkeeper with dashboard.view receives 200 OK and operational metrics',
      standardDashRes.status === 200
    );

    // 7. Shopkeeper attempting to access Admin dashboard is rejected
    const keeperAdminDashRes = await fetch(`${baseUrl}/dashboard/admin`, {
      headers: { Authorization: `Bearer ${keeperToken}` },
    });
    await assert(
      '7. Shopkeeper attempting to access Admin dashboard is rejected with 403 Forbidden',
      keeperAdminDashRes.status === 403
    );

    // 8. Invalid credentials verification
    const invalidCredsRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'keeper@apex.com', password: 'WrongPassword!' }),
    });
    await assert('8. Invalid password returns 401 INVALID_CREDENTIALS', invalidCredsRes.status === 401);

    // 9. Non-existent user login
    const nonExistentRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@apex.com', password: 'Password123!' }),
    });
    await assert('9. Non-existent account returns 401 INVALID_CREDENTIALS', nonExistentRes.status === 401);

    // 10. Expired or invalid token rejection
    const invalidTokenRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: 'Bearer totally.fake.and.invalid.jwt.token' },
    });
    await assert('10. Invalid JWT token returns 401 UNAUTHORIZED', invalidTokenRes.status === 401);

    // 11. Profile retrieval via /auth/me for Shopkeeper
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${keeperToken}` },
    });
    const meJson = (await meRes.json()) as any;
    await assert(
      '11. /auth/me returns Shopkeeper profile and tenant shop details',
      meRes.status === 200 &&
        meJson.user.role === 'SHOPKEEPER' &&
        meJson.user.email === 'keeper@apex.com' &&
        meJson.shop !== null
    );

    // 12. Token refresh rotation
    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await assert('12. Missing refresh token in body and cookie returns 400', refreshRes.status === 400);

    // 13. Clean logout
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${keeperToken}` },
    });
    await assert('13. Shopkeeper logout succeeds with 200 OK', logoutRes.status === 200);

    console.log(`\nStep 09 Verification Results: ${passed} PASSED, ${failed} FAILED.`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fatal error in Step 09 tests:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    closeDatabase();
  }
}

runStep09Tests();
