import http from 'http';
import { createApp } from '../app';
import { closeDatabase, getDatabase } from '../config/database';

// Simple lightweight test runner without external dependencies
async function runTests() {
  console.log('--- Starting Authentication & Multi-Tenancy Verification Tests ---');

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
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthJson = (await healthRes.json()) as any;
    await assert(
      'Health endpoint confirms database is connected',
      healthRes.status === 200 && healthJson.database?.connected === true
    );

    // 2. Demo accounts verification from seed
    const apexLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@apex.com', password: 'Password123!' }),
    });
    const apexLoginJson = (await apexLoginRes.json()) as any;
    await assert('Apex Admin demo login succeeds', apexLoginRes.status === 200 && apexLoginJson.user.role === 'SHOP_ADMIN');
    const apexAdminToken = apexLoginJson.accessToken;
    const apexShopId = apexLoginJson.shop.id;

    // 3. Invalid credentials test
    const invalidLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@apex.com', password: 'WrongPassword999!' }),
    });
    await assert('Invalid password returns 401 Unauthorized', invalidLoginRes.status === 401);

    // 4. Shop Registration test (Independent Tenant)
    const newShopEmail = `founder_${Date.now()}@prismwireless.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopName: 'Prism Wireless',
        ownerName: 'Tariq Malik',
        email: newShopEmail,
        phone: '+1 555-432-1098',
        address: '55 Innovation Way, Seattle, WA',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!',
      }),
    });
    const regJson = (await regRes.json()) as any;
    await assert('New Shop Registration succeeds with 201 Created', regRes.status === 201 && regJson.shop.name === 'Prism Wireless');
    await assert('Owner account is automatically assigned SHOP_ADMIN', regJson.user.role === 'SHOP_ADMIN');
    const prismToken = regJson.accessToken;

    // 5. Duplicate Email Registration rejected
    const dupRegRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopName: 'Prism Wireless Clone',
        ownerName: 'Copycat',
        email: newShopEmail,
        phone: '+1 555-432-1098',
        address: '55 Innovation Way',
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!',
      }),
    });
    await assert('Duplicate email registration is rejected with 409 Conflict', dupRegRes.status === 409);

    // 6. User Management: Apex Admin creates a shopkeeper in Apex shop
    const newKeeperEmail = `staff_${Date.now()}@apex.com`;
    const createKeeperRes = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({
        name: 'Jordan Sparks',
        email: newKeeperEmail,
        password: 'Password123!',
        phone: '+1 555-234-9988',
        role: 'SHOPKEEPER',
        permissions: ['pos.access', 'inventory.view'],
      }),
    });
    const createKeeperJson = (await createKeeperRes.json()) as any;
    await assert('Apex Admin can create new shopkeeper', createKeeperRes.status === 201 && createKeeperJson.data.email === newKeeperEmail);
    const apexStaffId = createKeeperJson.data.id;

    // 7. Login as Nova Admin (Tenant 2)
    const novaLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@novamobile.com', password: 'Password123!' }),
    });
    const novaLoginJson = (await novaLoginRes.json()) as any;
    const novaAdminToken = novaLoginJson.accessToken;
    const novaShopId = novaLoginJson.shop.id;
    await assert('Nova Admin login succeeds', novaLoginRes.status === 200 && novaShopId !== apexShopId);

    // 8. MULTI-TENANT ISOLATION: Nova Admin lists users
    const novaUsersRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${novaAdminToken}` },
    });
    const novaUsersJson = (await novaUsersRes.json()) as any;
    const novaUserEmails = (novaUsersJson.data as any[]).map((u) => u.email);
    await assert(
      'Nova Admin only sees Nova users and cannot see Apex users',
      novaUserEmails.includes('owner@novamobile.com') &&
        !novaUserEmails.includes('admin@apex.com') &&
        !novaUserEmails.includes(newKeeperEmail)
    );

    // 9. CROSS-TENANT ATTACK TEST: Nova Admin attempts to fetch Apex user by ID
    const crossTenantGetRes = await fetch(`${baseUrl}/users/${apexStaffId}`, {
      headers: { Authorization: `Bearer ${novaAdminToken}` },
    });
    await assert('Cross-tenant user lookup by ID is rejected (404 Not Found)', crossTenantGetRes.status === 404);

    // 10. CROSS-TENANT ATTACK TEST: Nova Admin attempts to modify Apex user permissions
    const crossTenantPermRes = await fetch(`${baseUrl}/users/${apexStaffId}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${novaAdminToken}`,
      },
      body: JSON.stringify({ permissions: ['inventory.manage'] }),
    });
    await assert('Cross-tenant permission update is rejected (404 Not Found)', crossTenantPermRes.status === 404);

    // 11. ROLE-BASED ACCESS CONTROL: Shopkeeper attempts Admin-only actions
    const keeperLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'keeper@apex.com', password: 'Password123!' }),
    });
    const keeperLoginJson = (await keeperLoginRes.json()) as any;
    const keeperToken = keeperLoginJson.accessToken;

    const keeperListUsersRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${keeperToken}` },
    });
    await assert('Shopkeeper attempting to access User Management is forbidden (403)', keeperListUsersRes.status === 403);

    const keeperUpdateShopRes = await fetch(`${baseUrl}/shop/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keeperToken}`,
      },
      body: JSON.stringify({
        name: 'Hacked Shop Name',
        ownerName: 'Hacker',
        phone: '123',
        address: 'Nowhere',
      }),
    });
    await assert('Shopkeeper attempting to update Shop Profile is forbidden (403)', keeperUpdateShopRes.status === 403);

    // 12. Deactivation enforcement: Apex Admin deactivates created staff
    const deactivateRes = await fetch(`${baseUrl}/users/${apexStaffId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
    await assert('Admin can deactivate staff member', deactivateRes.status === 200);

    // 13. Deactivated user cannot log in
    const deactivatedLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newKeeperEmail, password: 'Password123!' }),
    });
    await assert('Deactivated user login is rejected (403 USER_INACTIVE)', deactivatedLoginRes.status === 403);

    // 14. Self-deactivation prevention: Admin cannot deactivate themselves
    const selfDeactivateRes = await fetch(`${baseUrl}/users/${apexLoginJson.user.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apexAdminToken}`,
      },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
    await assert('Admin self-deactivation is prohibited (400)', selfDeactivateRes.status === 400);

    // 15. Permissions Catalog: GET /api/permissions
    const permsRes = await fetch(`${baseUrl}/permissions`, {
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    const permsJson = (await permsRes.json()) as any;
    await assert('Permissions catalog returns full list of 20 system permissions', permsRes.status === 200 && permsJson.data.length >= 20);

    // 16. Logout test
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apexAdminToken}` },
    });
    await assert('Logout succeeds with 200 OK', logoutRes.status === 200);

    console.log(`\nVerification Test Results: ${passed} PASSED, ${failed} FAILED.`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Fatal error during test execution:', error);
    process.exitCode = 1;
  } finally {
    server.close();
    closeDatabase();
  }
}

runTests();
