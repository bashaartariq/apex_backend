import http from 'http';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { closeDatabase, getDatabase } from '../config/database';
import { env } from '../config/env';

async function runSessionExpirationTests() {
  console.log('--- Starting Step 10: Automatic Logout & Session Expiration Verification Tests ---');

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
    // 1. Authenticate users to acquire baseline sessions
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@apex.com', password: 'Password123!' }),
    });
    const adminLoginJson = (await adminLoginRes.json()) as any;
    const adminCookies = adminLoginRes.headers.get('set-cookie') || '';
    const adminToken = adminLoginJson.accessToken;
    await assert('Baseline Admin login succeeds', adminLoginRes.status === 200 && !!adminToken);

    const keeperLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'keeper@apex.com', password: 'Password123!' }),
    });
    const keeperLoginJson = (await keeperLoginRes.json()) as any;
    const keeperCookies = keeperLoginRes.headers.get('set-cookie') || '';
    const keeperToken = keeperLoginJson.accessToken;
    await assert('Baseline Shopkeeper login succeeds', keeperLoginRes.status === 200 && !!keeperToken);

    // 2. Generate an intentionally expired access token (expired 1 hour ago)
    const expiredPayload = {
      userId: keeperLoginJson.user.id,
      shopId: keeperLoginJson.shop.id,
      role: keeperLoginJson.user.role,
      email: keeperLoginJson.user.email,
    };
    const expiredToken = jwt.sign(expiredPayload, env.jwtAccessSecret, { expiresIn: '-1h' });

    // Scenario 1: User session expires while accessing Dashboard
    const dashExpiredRes = await fetch(`${baseUrl}/dashboard/shopkeeper`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const dashExpiredJson = (await dashExpiredRes.json()) as any;
    await assert(
      'Scenario 1: Dashboard API returns 401 TOKEN_EXPIRED when token expires',
      dashExpiredRes.status === 401 && dashExpiredJson.error?.code === 'TOKEN_EXPIRED'
    );

    // Scenario 2: User session expires while using POS / Sales
    const posExpiredRes = await fetch(`${baseUrl}/sales`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const posExpiredJson = (await posExpiredRes.json()) as any;
    await assert(
      'Scenario 2: POS API returns 401 TOKEN_EXPIRED when token expires',
      posExpiredRes.status === 401 && posExpiredJson.error?.code === 'TOKEN_EXPIRED'
    );

    // Scenario 3: User session expires while working in Inventory
    const invExpiredRes = await fetch(`${baseUrl}/inventory/stock-summary`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const invExpiredJson = (await invExpiredRes.json()) as any;
    await assert(
      'Scenario 3: Inventory API returns 401 TOKEN_EXPIRED when token expires',
      invExpiredRes.status === 401 && invExpiredJson.error?.code === 'TOKEN_EXPIRED'
    );

    // Scenario 4: User session expires while accessing Customers
    const custExpiredRes = await fetch(`${baseUrl}/customers`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const custExpiredJson = (await custExpiredRes.json()) as any;
    await assert(
      'Scenario 4: Customers API returns 401 TOKEN_EXPIRED when token expires',
      custExpiredRes.status === 401 && custExpiredJson.error?.code === 'TOKEN_EXPIRED'
    );

    // Scenario 5: Multiple concurrent API requests return 401 simultaneously
    const simultaneousPromises = [
      fetch(`${baseUrl}/dashboard/shopkeeper`, { headers: { Authorization: `Bearer ${expiredToken}` } }),
      fetch(`${baseUrl}/inventory/phones`, { headers: { Authorization: `Bearer ${expiredToken}` } }),
      fetch(`${baseUrl}/inventory/accessories`, { headers: { Authorization: `Bearer ${expiredToken}` } }),
      fetch(`${baseUrl}/customers`, { headers: { Authorization: `Bearer ${expiredToken}` } }),
    ];
    const simultaneousResults = await Promise.all(simultaneousPromises);
    const allReturned401 = simultaneousResults.every((res) => res.status === 401);
    await assert('Scenario 5: All concurrent requests with expired tokens return 401 consistently', allReturned401);

    // Scenario 6: HTTP 403 Forbidden does NOT return 401 (proves session is still active)
    const forbiddenRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${keeperToken}` },
    });
    await assert(
      'Scenario 6: HTTP 403 Forbidden is isolated and does not return 401',
      forbiddenRes.status === 403
    );

    // Scenario 7: Public endpoints (/auth/login) invalid credentials return 401 without affecting session handlers
    const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@apex.com', password: 'WrongPassword!' }),
    });
    const badLoginJson = (await badLoginRes.json()) as any;
    await assert(
      'Scenario 7: Login failures return 401 INVALID_CREDENTIALS, isolated from TOKEN_EXPIRED',
      badLoginRes.status === 401 && badLoginJson.error?.code === 'INVALID_CREDENTIALS'
    );

    // Scenario 8: Token refresh endpoint succeeds with valid refresh token cookie
    // Extract refresh_token cookie from login response
    const refreshTokenMatch = adminCookies.match(/refresh_token=([^;]+)/);
    const rawRefreshToken = refreshTokenMatch ? refreshTokenMatch[1] : '';

    const refreshSuccessRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `refresh_token=${rawRefreshToken}`,
      },
      body: JSON.stringify({ refreshToken: rawRefreshToken }),
    });
    const refreshSuccessJson = (await refreshSuccessRes.json()) as any;
    await assert(
      'Scenario 8: Token refresh endpoint rotates access token successfully',
      refreshSuccessRes.status === 200 &&
        refreshSuccessJson.success === true &&
        typeof refreshSuccessJson.accessToken === 'string'
    );
    const renewedAdminToken = refreshSuccessJson.accessToken;

    // Verify renewed token works on protected API
    const testWithRenewedRes = await fetch(`${baseUrl}/dashboard/admin`, {
      headers: { Authorization: `Bearer ${renewedAdminToken}` },
    });
    await assert('Scenario 8b: Rotated access token authenticates on protected endpoints', testWithRenewedRes.status === 200);

    // Scenario 9: Expired or invalid refresh token triggers 401 INVALID_REFRESH_TOKEN
    const fakeRefreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'totally_invalid_refresh_token_12345' }),
    });
    const fakeRefreshJson = (await fakeRefreshRes.json()) as any;
    await assert(
      'Scenario 9: Invalid refresh token returns 401 INVALID_REFRESH_TOKEN',
      fakeRefreshRes.status === 401 && fakeRefreshJson.error?.code === 'INVALID_REFRESH_TOKEN'
    );

    // Scenario 10: Re-authentication after automatic logout restores access
    const reLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'keeper@apex.com', password: 'Password123!' }),
    });
    const reLoginJson = (await reLoginRes.json()) as any;
    const freshKeeperToken = reLoginJson.accessToken;
    const freshKeeperCheck = await fetch(`${baseUrl}/dashboard/shopkeeper`, {
      headers: { Authorization: `Bearer ${freshKeeperToken}` },
    });
    await assert(
      'Scenario 10: Re-authentication restores full protected workspace access',
      reLoginRes.status === 200 && freshKeeperCheck.status === 200
    );

    console.log(`\nStep 10 Verification Results: ${passed} PASSED, ${failed} FAILED.`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fatal error in Step 10 tests:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    closeDatabase();
  }
}

runSessionExpirationTests();
