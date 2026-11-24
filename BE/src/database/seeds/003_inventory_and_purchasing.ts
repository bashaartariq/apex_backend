import Database from 'better-sqlite3';
import { Seed } from './001_system_metadata';

export const STANDARD_CATEGORIES = [
  'Hands-free',
  'Earbuds',
  'Smartwatches',
  'Chargers',
  'Cables',
  'Mobile covers',
  'Screen protectors',
  'Other accessories',
];

export const seed003InventoryAndPurchasing: Seed = {
  id: '003_inventory_and_purchasing',
  description: 'Seed standard accessory categories, demo suppliers, phone inventory, and FIFO accessory stock',
  run(db: Database.Database): void {
    const apexShopId = 'shop_apex_cellular_001';
    const apexAdminId = 'user_apex_admin_001';
    const novaShopId = 'shop_nova_mobile_002';
    const novaAdminId = 'user_nova_admin_002';
    const nowIso = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);

    // 1. Insert Accessory Categories for both demo shops
    const insertCatStmt = db.prepare(`
      INSERT INTO accessory_categories (id, shop_id, name, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(shop_id, name) DO NOTHING
    `);

    const apexCatMap = new Map<string, string>();
    for (const catName of STANDARD_CATEGORIES) {
      const catId = `cat_apex_${catName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      insertCatStmt.run(catId, apexShopId, catName, nowIso);
      apexCatMap.set(catName, catId);

      const novaCatId = `cat_nova_${catName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      insertCatStmt.run(novaCatId, novaShopId, catName, nowIso);
    }

    // 2. Insert Suppliers for Apex Cellular
    const insertSupplierStmt = db.prepare(`
      INSERT INTO suppliers (id, shop_id, name, contact_person, phone, email, address, business_id, notes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        contact_person = excluded.contact_person,
        phone = excluded.phone,
        status = excluded.status
    `);

    const supplierApexGlobal = 'supp_apex_global_001';
    const supplierSiliconTech = 'supp_silicon_tech_002';
    const supplierPacificSupply = 'supp_pacific_supply_003';
    const supplierInactive = 'supp_inactive_legacy_004';

    insertSupplierStmt.run(
      supplierApexGlobal,
      apexShopId,
      'Apex Global Distribution Ltd.',
      'Marcus Vance',
      '+1 (555) 401-2000',
      'orders@apexglobal.com',
      '100 Logistics Way, Fremont, CA 94538',
      'US-TAX-892104',
      'Primary Tier-1 Apple and Samsung authorized distributor. Payment terms Net 30.',
      'ACTIVE',
      nowIso,
      nowIso
    );

    insertSupplierStmt.run(
      supplierSiliconTech,
      apexShopId,
      'Silicon Valley Tech Wholesale',
      'Sarah Lin',
      '+1 (555) 401-3000',
      'sales@svtechwholesale.com',
      '420 Technology Blvd, Sunnyvale, CA 94085',
      'US-TAX-665120',
      'Specializes in fast chargers, braided cables, and audio accessories.',
      'ACTIVE',
      nowIso,
      nowIso
    );

    insertSupplierStmt.run(
      supplierPacificSupply,
      apexShopId,
      'Pacific Mobile Supply Co.',
      'David Chen',
      '+1 (555) 401-4000',
      'david@pacificmobile.com',
      '88 Harbor Street, Oakland, CA 94607',
      'US-TAX-334198',
      'Pre-owned graded smartphones and certified refurbishment supplier.',
      'ACTIVE',
      nowIso,
      nowIso
    );

    insertSupplierStmt.run(
      supplierInactive,
      apexShopId,
      'Legacy Imports International',
      'Arthur Pendelton',
      '+1 (555) 401-9999',
      'legacy@oldsupplies.com',
      'Closed Warehouse, San Jose, CA',
      'US-TAX-000000',
      'Deactivated supplier record. Kept for historical purchase tracking.',
      'INACTIVE',
      nowIso,
      nowIso
    );

    // Nova Supplier (Tenant 2)
    const supplierNova = 'supp_nova_austin_001';
    insertSupplierStmt.run(
      supplierNova,
      novaShopId,
      'Lone Star Cellular Distributors',
      'Travis Scott',
      '+1 (555) 890-4444',
      'travis@lonestar.com',
      '500 Congress Ave, Austin, TX 78701',
      'TX-TAX-441209',
      'Texas regional phone distributor.',
      'ACTIVE',
      nowIso,
      nowIso
    );

    // 3. Insert Confirmed Purchase PO-2026-0001 for Apex Cellular
    const purchaseId1 = 'po_apex_2026_0001';
    const insertPurchaseStmt = db.prepare(`
      INSERT INTO purchases (id, shop_id, supplier_id, reference_no, purchase_date, status, total_amount, tax_amount, discount_amount, notes, created_by, confirmed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);

    insertPurchaseStmt.run(
      purchaseId1,
      apexShopId,
      supplierApexGlobal,
      'PO-2026-0001',
      today,
      4150.0,
      150.0,
      0.0,
      'Q1 Flagship intake: iPhone 15 Pro, S24 Ultra, and Pixel 8 Pro devices + fast charging inventory.',
      apexAdminId,
      nowIso,
      nowIso,
      nowIso
    );

    // 4. Insert Phones into phone_inventory
    const insertPhoneStmt = db.prepare(`
      INSERT INTO phone_inventory (
        id, shop_id, supplier_id, purchase_id, brand, model, imei1, imei2, ram, storage, color,
        condition, purchase_cost, selling_price, battery_health, physical_condition, accessories_included,
        description, status, purchase_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_STOCK', ?, ?, ?)
      ON CONFLICT(shop_id, imei1) DO UPDATE SET
        brand = excluded.brand,
        model = excluded.model,
        selling_price = excluded.selling_price,
        status = excluded.status
    `);

    // Phone 1: iPhone 15 Pro Max 256GB Titanium
    insertPhoneStmt.run(
      'phone_apex_001',
      apexShopId,
      supplierApexGlobal,
      purchaseId1,
      'Apple',
      'iPhone 15 Pro Max',
      '354892019482711',
      '354892019482712',
      '8GB',
      '256GB',
      'Natural Titanium',
      'NEW',
      950.0,
      1199.0,
      100,
      'Brand New Sealed in Box',
      'USB-C braided cable, documentation',
      'Factory unlocked flagship model with AppleCare eligible status.',
      today,
      nowIso,
      nowIso
    );

    // Phone 2: iPhone 15 Pro 128GB Blue Titanium
    insertPhoneStmt.run(
      'phone_apex_002',
      apexShopId,
      supplierApexGlobal,
      purchaseId1,
      'Apple',
      'iPhone 15 Pro',
      '354892019482725',
      null,
      '8GB',
      '128GB',
      'Blue Titanium',
      'NEW',
      820.0,
      999.0,
      100,
      'Brand New Sealed',
      'Original USB-C cable',
      'A17 Pro chip, premium condition.',
      today,
      nowIso,
      nowIso
    );

    // Phone 3: Samsung Galaxy S24 Ultra 512GB
    insertPhoneStmt.run(
      'phone_apex_003',
      apexShopId,
      supplierApexGlobal,
      purchaseId1,
      'Samsung',
      'Galaxy S24 Ultra',
      '359871029481234',
      '359871029481235',
      '12GB',
      '512GB',
      'Titanium Gray',
      'NEW',
      1020.0,
      1299.0,
      100,
      'Brand New Sealed Box with S-Pen included',
      'S-Pen, USB-C to USB-C cable, SIM tool',
      'Galaxy AI flagship. Dual SIM support.',
      today,
      nowIso,
      nowIso
    );

    // Phone 4: Google Pixel 8 Pro 128GB (Pre-owned Grade A)
    insertPhoneStmt.run(
      'phone_apex_004',
      apexShopId,
      supplierPacificSupply,
      null, // Direct intake without PO
      'Google',
      'Pixel 8 Pro',
      '351239847562819',
      null,
      '12GB',
      '128GB',
      'Bay Blue',
      'USED',
      480.0,
      649.0,
      94,
      'Grade A minor micro-scratches on bezel only',
      'OEM Wall charger + Type C cable',
      'Tested 35-point hardware inspection passed. Screen immaculate.',
      today,
      nowIso,
      nowIso
    );

    // Phone 5 for Nova Mobile Hub (Tenant 2) with distinct IMEI
    insertPhoneStmt.run(
      'phone_nova_001',
      novaShopId,
      supplierNova,
      null,
      'Samsung',
      'Galaxy A54 5G',
      '358899001122334',
      null,
      '6GB',
      '128GB',
      'Awesome Graphite',
      'NEW',
      290.0,
      399.0,
      100,
      'Sealed Box',
      'Charging cable, documentation',
      'Mid-range popular seller in Austin branch.',
      today,
      nowIso,
      nowIso
    );

    // 5. Insert Accessories into accessories table
    const insertAccStmt = db.prepare(`
      INSERT INTO accessories (
        id, shop_id, category_id, supplier_id, name, brand, model, sku, barcode,
        purchase_cost, selling_price, available_quantity, min_stock_threshold, description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      ON CONFLICT(shop_id, sku) DO UPDATE SET
        name = excluded.name,
        available_quantity = excluded.available_quantity,
        purchase_cost = excluded.purchase_cost,
        selling_price = excluded.selling_price
    `);

    const chargerCatId = apexCatMap.get('Chargers')!;
    const screenCatId = apexCatMap.get('Screen protectors')!;
    const coverCatId = apexCatMap.get('Mobile covers')!;
    const earbudCatId = apexCatMap.get('Earbuds')!;

    // Acc 1: Anker 20W Fast Charger (20 in stock, multiple batches for FIFO test)
    insertAccStmt.run(
      'acc_apex_001',
      apexShopId,
      chargerCatId,
      supplierSiliconTech,
      'Anker PowerPort III 20W Cube',
      'Anker',
      'A2149',
      'ANK-CHG-20W',
      '194644021498',
      13.5, // latest cost
      22.0,
      20,
      5,
      'Ultra-compact foldable USB-C wall charger with PowerIQ 3.0.',
      nowIso,
      nowIso
    );

    // Acc 2: Apple 20W USB-C Adapter (LOW STOCK: 4 in stock, min threshold 5)
    insertAccStmt.run(
      'acc_apex_002',
      apexShopId,
      chargerCatId,
      supplierApexGlobal,
      'Apple 20W USB-C Power Adapter',
      'Apple',
      'MHJA3AM/A',
      'APP-CHG-20W',
      '194252157015',
      14.0,
      25.0,
      4,
      5,
      'Original Apple high-speed charging brick.',
      nowIso,
      nowIso
    );

    // Acc 3: Torras 9H Tempered Glass for iPhone 15 Pro (30 in stock)
    insertAccStmt.run(
      'acc_apex_003',
      apexShopId,
      screenCatId,
      supplierSiliconTech,
      'Torras Diamond Shield 9H Glass (iPhone 15 Pro)',
      'Torras',
      'IP15P-TG',
      'TOR-GLS-IP15P',
      '697241851201',
      3.5,
      15.0,
      30,
      8,
      'Edge-to-edge shatterproof military grade screen protector pack.',
      nowIso,
      nowIso
    );

    // Acc 4: Spigen Ultra Hybrid Case for S24 Ultra (18 in stock)
    insertAccStmt.run(
      'acc_apex_004',
      apexShopId,
      coverCatId,
      supplierSiliconTech,
      'Spigen Ultra Hybrid Matte Clear (S24 Ultra)',
      'Spigen',
      'ACS07321',
      'SPG-CSE-S24U',
      '880997122194',
      7.0,
      20.0,
      18,
      5,
      'Air cushion technology shock absorption transparent back cover.',
      nowIso,
      nowIso
    );

    // Acc 5: Soundcore Life P3 Noise Cancelling Earbuds (8 in stock)
    insertAccStmt.run(
      'acc_apex_005',
      apexShopId,
      earbudCatId,
      supplierSiliconTech,
      'Soundcore Life P3 ANC Wireless Earbuds',
      'Soundcore',
      'A3939',
      'SND-EAR-P3',
      '194644063931',
      42.0,
      79.0,
      8,
      3,
      'Multi-mode hybrid active noise cancelling, 35-hour playtime.',
      nowIso,
      nowIso
    );

    // 6. Insert FIFO Batches for Accessories
    const insertBatchStmt = db.prepare(`
      INSERT INTO accessory_batches (id, shop_id, accessory_id, purchase_id, batch_no, unit_cost, initial_quantity, remaining_quantity, purchase_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);

    // Anker batches: 10 @ $12.00 (older batch) + 10 @ $13.50 (newer batch)
    insertBatchStmt.run('batch_ank_01', apexShopId, 'acc_apex_001', purchaseId1, 'BATCH-2026-001', 12.0, 10, 10, today, nowIso);
    insertBatchStmt.run('batch_ank_02', apexShopId, 'acc_apex_001', purchaseId1, 'BATCH-2026-002', 13.5, 10, 10, today, nowIso);

    // Apple 20W: 4 @ $14.00
    insertBatchStmt.run('batch_app_01', apexShopId, 'acc_apex_002', purchaseId1, 'BATCH-2026-003', 14.0, 4, 4, today, nowIso);

    // Torras Glass: 30 @ $3.50
    insertBatchStmt.run('batch_tor_01', apexShopId, 'acc_apex_003', purchaseId1, 'BATCH-2026-004', 3.5, 30, 30, today, nowIso);

    // Spigen Case: 18 @ $7.00
    insertBatchStmt.run('batch_spg_01', apexShopId, 'acc_apex_004', purchaseId1, 'BATCH-2026-005', 7.0, 18, 18, today, nowIso);

    // Soundcore Earbuds: 8 @ $42.00
    insertBatchStmt.run('batch_snd_01', apexShopId, 'acc_apex_005', purchaseId1, 'BATCH-2026-006', 42.0, 8, 8, today, nowIso);

    // 7. Insert Low-Stock Alert for Apple 20W (Qty 4 <= Min 5)
    const insertAlertStmt = db.prepare(`
      INSERT INTO low_stock_alerts (id, shop_id, accessory_id, threshold, current_quantity, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)
      ON CONFLICT(id) DO NOTHING
    `);

    insertAlertStmt.run('alert_app_chg_001', apexShopId, 'acc_apex_002', 5, 4, nowIso);

    // 8. Insert Stock Movement audit records
    const insertMovementStmt = db.prepare(`
      INSERT INTO stock_movements (
        id, shop_id, item_type, product_id, product_name, identifier, movement_type,
        reference_id, quantity_delta, unit_cost, reason, performed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);

    insertMovementStmt.run(
      'mov_apex_001',
      apexShopId,
      'PHONE',
      'phone_apex_001',
      'Apple iPhone 15 Pro Max 256GB',
      '354892019482711',
      'PURCHASE',
      purchaseId1,
      1,
      950.0,
      'Received PO-2026-0001 from Apex Global Distribution Ltd.',
      apexAdminId,
      nowIso
    );

    insertMovementStmt.run(
      'mov_apex_002',
      apexShopId,
      'ACCESSORY',
      'acc_apex_001',
      'Anker PowerPort III 20W Cube',
      'ANK-CHG-20W',
      'PURCHASE',
      purchaseId1,
      20,
      12.75, // average of batches
      'Received PO-2026-0001 batch intake',
      apexAdminId,
      nowIso
    );
  },
};
