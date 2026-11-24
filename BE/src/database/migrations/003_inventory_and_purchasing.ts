import Database from 'better-sqlite3';
import { Migration } from './001_init_infrastructure';

export const migration003InventoryAndPurchasing: Migration = {
  id: '003_inventory_and_purchasing',
  description: 'Add suppliers, phone inventory, accessories, FIFO batches, purchases, stock movements, and stock-taking tables',
  up(db: Database.Database): void {
    db.exec(`
      -- 1. Suppliers
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT NOT NULL,
        email TEXT,
        address TEXT,
        business_id TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_suppliers_shop ON suppliers(shop_id);
      CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(shop_id, status);

      -- 2. Accessory Categories
      CREATE TABLE IF NOT EXISTS accessory_categories (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, name)
      );
      CREATE INDEX IF NOT EXISTS idx_categories_shop ON accessory_categories(shop_id);

      -- 3. Purchases (Header)
      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
        reference_no TEXT NOT NULL,
        purchase_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),
        total_amount REAL NOT NULL DEFAULT 0.0,
        tax_amount REAL NOT NULL DEFAULT 0.0,
        discount_amount REAL NOT NULL DEFAULT 0.0,
        notes TEXT,
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        confirmed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, reference_no)
      );
      CREATE INDEX IF NOT EXISTS idx_purchases_shop ON purchases(shop_id);
      CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(shop_id, status);

      -- 4. Mobile Phone Inventory (Individual IMEI tracking)
      CREATE TABLE IF NOT EXISTS phone_inventory (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
        purchase_id TEXT REFERENCES purchases(id) ON DELETE SET NULL,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        imei1 TEXT NOT NULL,
        imei2 TEXT,
        ram TEXT,
        storage TEXT,
        color TEXT,
        condition TEXT NOT NULL DEFAULT 'NEW' CHECK(condition IN ('NEW', 'USED')),
        purchase_cost REAL NOT NULL DEFAULT 0.0,
        selling_price REAL NOT NULL DEFAULT 0.0,
        battery_health INTEGER,
        physical_condition TEXT,
        accessories_included TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK(status IN ('IN_STOCK', 'SOLD', 'RETURNED', 'RESERVED', 'UNDER_REPAIR')),
        purchase_date TEXT NOT NULL DEFAULT (date('now')),
        sold_date TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, imei1)
      );
      CREATE INDEX IF NOT EXISTS idx_phones_shop_imei1 ON phone_inventory(shop_id, imei1);
      CREATE INDEX IF NOT EXISTS idx_phones_shop_status ON phone_inventory(shop_id, status);
      CREATE INDEX IF NOT EXISTS idx_phones_shop_brand_model ON phone_inventory(shop_id, brand, model);
      CREATE INDEX IF NOT EXISTS idx_phones_supplier ON phone_inventory(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_phones_purchase ON phone_inventory(purchase_id);

      -- 5. Accessories (Quantity-based tracking)
      CREATE TABLE IF NOT EXISTS accessories (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES accessory_categories(id) ON DELETE RESTRICT,
        supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        brand TEXT NOT NULL,
        model TEXT,
        sku TEXT NOT NULL,
        barcode TEXT,
        purchase_cost REAL NOT NULL DEFAULT 0.0,
        selling_price REAL NOT NULL DEFAULT 0.0,
        available_quantity INTEGER NOT NULL DEFAULT 0 CHECK(available_quantity >= 0),
        min_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK(min_stock_threshold >= 0),
        description TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, sku)
      );
      CREATE INDEX IF NOT EXISTS idx_accessories_shop_sku ON accessories(shop_id, sku);
      CREATE INDEX IF NOT EXISTS idx_accessories_shop_barcode ON accessories(shop_id, barcode);
      CREATE INDEX IF NOT EXISTS idx_accessories_shop_category ON accessories(shop_id, category_id);

      -- 6. Accessory Purchase Batches (Strict FIFO valuation & consumption)
      CREATE TABLE IF NOT EXISTS accessory_batches (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        accessory_id TEXT NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
        purchase_id TEXT REFERENCES purchases(id) ON DELETE SET NULL,
        batch_no TEXT NOT NULL,
        unit_cost REAL NOT NULL,
        initial_quantity INTEGER NOT NULL,
        remaining_quantity INTEGER NOT NULL CHECK(remaining_quantity >= 0),
        purchase_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_batches_accessory_fifo ON accessory_batches(accessory_id, remaining_quantity, purchase_date ASC);
      CREATE INDEX IF NOT EXISTS idx_batches_shop ON accessory_batches(shop_id);

      -- 7. Purchase Items (Line items for purchases)
      CREATE TABLE IF NOT EXISTS purchase_items (
        id TEXT PRIMARY KEY,
        purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL CHECK(item_type IN ('PHONE', 'ACCESSORY')),
        product_id TEXT,
        accessory_id TEXT REFERENCES accessories(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_cost REAL NOT NULL,
        subtotal REAL NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

      -- 8. Stock Movements (Historical audit trail for all stock fluctuations)
      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL CHECK(item_type IN ('PHONE', 'ACCESSORY')),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        identifier TEXT,
        movement_type TEXT NOT NULL CHECK(movement_type IN ('PURCHASE', 'ADJUSTMENT', 'STOCK_TAKE', 'INITIAL')),
        reference_id TEXT,
        quantity_delta INTEGER NOT NULL,
        unit_cost REAL NOT NULL DEFAULT 0.0,
        reason TEXT NOT NULL,
        performed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_movements_shop_created ON stock_movements(shop_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);

      -- 9. Stock Adjustments (Manual corrections log by Admin)
      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL CHECK(item_type IN ('PHONE', 'ACCESSORY')),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        previous_quantity INTEGER NOT NULL,
        new_quantity INTEGER NOT NULL,
        quantity_delta INTEGER NOT NULL,
        previous_status TEXT,
        new_status TEXT,
        reason TEXT NOT NULL,
        performed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_adjustments_shop ON stock_adjustments(shop_id, created_at DESC);

      -- 10. Low-Stock Alerts
      CREATE TABLE IF NOT EXISTS low_stock_alerts (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        accessory_id TEXT NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
        threshold INTEGER NOT NULL,
        current_quantity INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'RESOLVED')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_shop_status ON low_stock_alerts(shop_id, status);
      CREATE INDEX IF NOT EXISTS idx_alerts_accessory ON low_stock_alerts(accessory_id);

      -- 11. Stock-Taking Sessions (Physical stock audits)
      CREATE TABLE IF NOT EXISTS stock_takes (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        session_code TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS', 'FINALIZED', 'CANCELLED')),
        started_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        finalized_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finalized_at TEXT,
        notes TEXT,
        UNIQUE(shop_id, session_code)
      );
      CREATE INDEX IF NOT EXISTS idx_stock_takes_shop ON stock_takes(shop_id);

      -- 12. Stock-Taking Items (Discrepancy count lines)
      CREATE TABLE IF NOT EXISTS stock_take_items (
        id TEXT PRIMARY KEY,
        stock_take_id TEXT NOT NULL REFERENCES stock_takes(id) ON DELETE CASCADE,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL CHECK(item_type IN ('PHONE', 'ACCESSORY')),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        identifier TEXT,
        expected_quantity INTEGER NOT NULL,
        counted_quantity INTEGER NOT NULL,
        discrepancy INTEGER NOT NULL,
        discrepancy_reason TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_stock_take_items_session ON stock_take_items(stock_take_id);
    `);
  },
};
