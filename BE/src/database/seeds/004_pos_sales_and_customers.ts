import Database from 'better-sqlite3';
import { Seed } from './001_system_metadata';
import { encryptCnic, maskCnic, hashCnic } from '../../utils/cnic';

export const seed004PosSalesAndCustomers: Seed = {
  id: '004_pos_sales_and_customers',
  description: 'Seed shop tax settings, sequence counters, and demo customers with encrypted CNIC and credit limits',
  run(db: Database.Database): void {
    const apexShopId = 'shop_apex_cellular_001';
    const novaShopId = 'shop_nova_mobile_002';
    const nowIso = new Date().toISOString();

    // 1. Shop Tax Settings
    const insertTaxStmt = db.prepare(`
      INSERT INTO shop_tax_settings (id, shop_id, tax_enabled, tax_rate, tax_name, is_tax_inclusive, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_id) DO UPDATE SET
        tax_enabled = excluded.tax_enabled,
        tax_rate = excluded.tax_rate,
        tax_name = excluded.tax_name,
        is_tax_inclusive = excluded.is_tax_inclusive
    `);

    insertTaxStmt.run('tax_apex_001', apexShopId, 1, 5.0, 'GST / Sales Tax', 0, nowIso, nowIso);
    insertTaxStmt.run('tax_nova_002', novaShopId, 1, 4.0, 'State Sales Tax', 0, nowIso, nowIso);

    // 2. Numbering Sequences
    const insertInvSeq = db.prepare(`
      INSERT INTO invoice_sequences (id, shop_id, current_number, prefix, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_id) DO NOTHING
    `);
    insertInvSeq.run('seq_inv_apex', apexShopId, 0, 'INV', nowIso, nowIso);
    insertInvSeq.run('seq_inv_nova', novaShopId, 0, 'INV', nowIso, nowIso);

    const insertRecSeq = db.prepare(`
      INSERT INTO receipt_sequences (id, shop_id, current_number, prefix, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_id) DO NOTHING
    `);
    insertRecSeq.run('seq_rec_apex', apexShopId, 0, 'REC', nowIso, nowIso);
    insertRecSeq.run('seq_rec_nova', novaShopId, 0, 'REC', nowIso, nowIso);

    // 3. Demo Customers for Apex Cellular
    const insertCustomerStmt = db.prepare(`
      INSERT INTO customers (
        id, shop_id, name, phone, cnic_encrypted, cnic_masked, cnic_hash, email, address,
        credit_limit, outstanding_balance, status, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        phone = excluded.phone,
        credit_limit = excluded.credit_limit,
        outstanding_balance = excluded.outstanding_balance
    `);

    const customersData = [
      {
        id: 'cust_apex_usman_001',
        shopId: apexShopId,
        name: 'Usman Ali',
        phone: '0300-1234567',
        cnic: '42101-1234567-1',
        email: 'usman.ali@example.com',
        address: 'House 42, Block 6, PECHS, Karachi',
        creditLimit: 1500.0,
        outstandingBalance: 0.0,
        notes: 'VIP customer, verified corporate buyer',
      },
      {
        id: 'cust_apex_sara_002',
        shopId: apexShopId,
        name: 'Sara Khan',
        phone: '0321-9876543',
        cnic: '35201-7654321-2',
        email: 'sara.k@example.com',
        address: 'Apartment 12-B, Gulberg III, Lahore',
        creditLimit: 600.0,
        outstandingBalance: 120.0,
        notes: 'Regular retail customer with partial credit balance',
      },
      {
        id: 'cust_apex_bilal_003',
        shopId: apexShopId,
        name: 'Bilal Ahmed',
        phone: '0333-5551234',
        cnic: '61101-2345678-3',
        email: 'bilal.ahmed@example.com',
        address: 'Sector F-8/2, Islamabad',
        creditLimit: 800.0,
        outstandingBalance: 0.0,
        notes: 'Trusted client with high volume accessory purchases',
      },
    ];

    for (const c of customersData) {
      const encrypted = encryptCnic(c.cnic);
      const masked = maskCnic(c.cnic);
      const hash = hashCnic(c.cnic);
      insertCustomerStmt.run(
        c.id,
        c.shopId,
        c.name,
        c.phone,
        encrypted,
        masked,
        hash,
        c.email,
        c.address,
        c.creditLimit,
        c.outstandingBalance,
        'ACTIVE',
        c.notes,
        nowIso,
        nowIso
      );
    }

    // Default Walk-in Customer for Apex Cellular (no CNIC)
    db.prepare(`
      INSERT INTO customers (
        id, shop_id, name, phone, cnic_encrypted, cnic_masked, cnic_hash, email, address,
        credit_limit, outstanding_balance, status, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(
      'cust_apex_walkin_000',
      apexShopId,
      'Walk-in Retail Customer',
      '',
      null,
      null,
      null,
      '',
      '',
      0.0,
      0.0,
      'ACTIVE',
      'Standard counter customer for retail sales',
      nowIso,
      nowIso
    );

    // Customer for Nova Mobile to test tenant isolation
    const novaCnic = '17301-9988776-5';
    insertCustomerStmt.run(
      'cust_nova_tariq_001',
      novaShopId,
      'Tariq Mehmood',
      '0345-1122334',
      encryptCnic(novaCnic),
      maskCnic(novaCnic),
      hashCnic(novaCnic),
      'tariq.nova@example.com',
      'University Road, Peshawar',
      500.0,
      0.0,
      'ACTIVE',
      'Nova client',
      nowIso,
      nowIso
    );
  },
};
