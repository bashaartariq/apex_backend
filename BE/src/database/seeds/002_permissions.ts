import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { Seed } from './001_system_metadata';

export interface PermissionDefinition {
  id: string;
  name: string;
  module: string;
  description: string;
}

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  { id: 'dashboard.view', name: 'View Dashboard', module: 'Dashboard', description: 'View shop analytics, KPI metrics, and summary cards' },
  { id: 'inventory.view', name: 'View Inventory', module: 'Inventory', description: 'Browse and search inventory catalog and stock levels' },
  { id: 'inventory.manage', name: 'Manage Inventory', module: 'Inventory', description: 'Create, update, adjust stock, and manage product details' },
  { id: 'phones.view', name: 'View Mobile Phones', module: 'Phones', description: 'Browse mobile phones, models, variants, and IMEI status' },
  { id: 'phones.manage', name: 'Manage Mobile Phones', module: 'Phones', description: 'Add, update phone specifications, costs, and IMEI records' },
  { id: 'accessories.view', name: 'View Accessories', module: 'Accessories', description: 'View phone accessories, chargers, cases, and supplies' },
  { id: 'accessories.manage', name: 'Manage Accessories', module: 'Accessories', description: 'Add, edit accessory items, barcode, and retail prices' },
  { id: 'purchases.view', name: 'View Purchases', module: 'Purchasing', description: 'View purchase orders, incoming shipments, and supplier invoices' },
  { id: 'purchases.manage', name: 'Manage Purchases', module: 'Purchasing', description: 'Create purchase orders, receive inventory, and log costs' },
  { id: 'suppliers.view', name: 'View Suppliers', module: 'Suppliers', description: 'Browse supplier directory and supplier balance summaries' },
  { id: 'suppliers.manage', name: 'Manage Suppliers', module: 'Suppliers', description: 'Create and update supplier contacts and payment terms' },
  { id: 'pos.access', name: 'Access POS Register', module: 'POS', description: 'Open POS register, scan items, and ring up customer sales' },
  { id: 'pos.discount', name: 'Apply Discounts in POS', module: 'POS', description: 'Apply discretionary line-item or invoice discounts at checkout' },
  { id: 'customers.view', name: 'View Customers', module: 'Customers', description: 'Browse customer list, loyalty info, and order history' },
  { id: 'customers.manage', name: 'Manage Customers', module: 'Customers', description: 'Create customer profiles, update contact details and notes' },
  { id: 'returns.manage', name: 'Manage Returns & Exchanges', module: 'Returns', description: 'Authorize returns, process refunds, and issue store credits' },
  { id: 'warranty.manage', name: 'Manage Warranty & Repairs', module: 'Warranty', description: 'Track warranty claims, repair job cards, and service statuses' },
  { id: 'reports.view', name: 'View Reports & Exports', module: 'Reports', description: 'Run financial reports, daily reconciliation, and CSV exports' },
  { id: 'settings.manage', name: 'Manage Shop Settings', module: 'Settings', description: 'Edit shop address, tax rates, receipts, and store options' },
  { id: 'users.manage', name: 'Manage Shop Staff', module: 'Staff', description: 'Create, edit shopkeepers, toggle statuses, and set permissions' },
];

export const seed002PermissionsAndDemoTenants: Seed = {
  id: '002_permissions_and_demo_tenants',
  description: 'Seed standard permission catalog and demo tenant shops for testing and demonstration',
  run(db: Database.Database): void {
    // 1. Insert permissions
    const insertPermStmt = db.prepare(`
      INSERT INTO permissions (id, name, module, description)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        module = excluded.module,
        description = excluded.description
    `);

    for (const perm of SYSTEM_PERMISSIONS) {
      insertPermStmt.run(perm.id, perm.name, perm.module, perm.description);
    }

    // 2. Insert Demo Tenant 1 (Apex Cellular & Tech)
    const apexShopId = 'shop_apex_cellular_001';
    const apexAdminId = 'user_apex_admin_001';
    const apexKeeperId = 'user_apex_keeper_001';

    const insertShopStmt = db.prepare(`
      INSERT INTO shops (id, name, owner_name, email, phone, address, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        owner_name = excluded.owner_name,
        phone = excluded.phone,
        address = excluded.address
    `);

    insertShopStmt.run(
      apexShopId,
      'Apex Cellular & Tech',
      'Rakib Kowshar',
      'admin@apex.com',
      '+1 (555) 234-5678',
      '742 Tech Boulevard, Suite 100, San Jose, CA 95112'
    );

    const defaultPasswordHash = bcrypt.hashSync('Password123!', 10);

    const insertUserStmt = db.prepare(`
      INSERT INTO users (id, shop_id, name, email, password_hash, phone, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        password_hash = excluded.password_hash,
        phone = excluded.phone,
        role = excluded.role,
        status = excluded.status
    `);

    // Apex Admin
    insertUserStmt.run(
      apexAdminId,
      apexShopId,
      'Rakib Kowshar',
      'admin@apex.com',
      defaultPasswordHash,
      '+1 (555) 234-5678',
      'SHOP_ADMIN'
    );

    // Apex Shopkeeper
    insertUserStmt.run(
      apexKeeperId,
      apexShopId,
      'Alex Johnson',
      'keeper@apex.com',
      defaultPasswordHash,
      '+1 (555) 234-9000',
      'SHOPKEEPER'
    );

    // Assign standard shopkeeper permissions to Alex Johnson (POS, Inventory view, Customers view)
    const keeperPerms = [
      'dashboard.view',
      'pos.access',
      'inventory.view',
      'phones.view',
      'accessories.view',
      'customers.view',
      'customers.manage',
    ];

    const insertUserPermStmt = db.prepare(`
      INSERT INTO user_permissions (user_id, permission_id)
      VALUES (?, ?)
      ON CONFLICT(user_id, permission_id) DO NOTHING
    `);

    for (const permId of keeperPerms) {
      insertUserPermStmt.run(apexKeeperId, permId);
    }

    // 3. Insert Demo Tenant 2 (Nova Mobile Hub - isolated tenant)
    const novaShopId = 'shop_nova_mobile_002';
    const novaAdminId = 'user_nova_admin_002';
    const novaKeeperId = 'user_nova_staff_002';

    insertShopStmt.run(
      novaShopId,
      'Nova Mobile Hub',
      'Elena Vance',
      'owner@novamobile.com',
      '+1 (555) 890-1234',
      '12 Market Arcade, Austin, TX 78701'
    );

    // Nova Admin
    insertUserStmt.run(
      novaAdminId,
      novaShopId,
      'Elena Vance',
      'owner@novamobile.com',
      defaultPasswordHash,
      '+1 (555) 890-1234',
      'SHOP_ADMIN'
    );

    // Nova Shopkeeper
    insertUserStmt.run(
      novaKeeperId,
      novaShopId,
      'Marcus Bell',
      'staff@novamobile.com',
      defaultPasswordHash,
      '+1 (555) 890-5678',
      'SHOPKEEPER'
    );

    for (const permId of ['pos.access', 'inventory.view']) {
      insertUserPermStmt.run(novaKeeperId, permId);
    }
  },
};
