import Database from 'better-sqlite3';
import { Migration } from './001_init_infrastructure';

export const migration004PosSalesAndCustomers: Migration = {
  id: '004_pos_sales_and_customers',
  description: 'Schema migration for customers, POS sales, payments, discounts, credit limits, returns, warranties, and receipts',
  up(db: Database.Database): void {
    db.exec(`
      -- 1. Customers
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT,
        cnic_encrypted TEXT,
        cnic_masked TEXT,
        cnic_hash TEXT,
        email TEXT,
        address TEXT,
        credit_limit REAL NOT NULL DEFAULT 0.0,
        outstanding_balance REAL NOT NULL DEFAULT 0.0,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, cnic_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(shop_id, phone);
      CREATE INDEX IF NOT EXISTS idx_customers_cnic_hash ON customers(shop_id, cnic_hash);

      -- 2. Shop Tax Settings
      CREATE TABLE IF NOT EXISTS shop_tax_settings (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        tax_enabled INTEGER NOT NULL DEFAULT 1,
        tax_rate REAL NOT NULL DEFAULT 0.0,
        tax_name TEXT NOT NULL DEFAULT 'GST / Sales Tax',
        is_tax_inclusive INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id)
      );

      -- 3. Numbering Sequences (Invoices & Receipts)
      CREATE TABLE IF NOT EXISTS invoice_sequences (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        current_number INTEGER NOT NULL DEFAULT 0,
        prefix TEXT NOT NULL DEFAULT 'INV',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id)
      );

      CREATE TABLE IF NOT EXISTS receipt_sequences (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        current_number INTEGER NOT NULL DEFAULT 0,
        prefix TEXT NOT NULL DEFAULT 'REC',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id)
      );

      -- 4. Discount Requests (Admin approval workflow)
      CREATE TABLE IF NOT EXISTS discount_requests (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL CHECK(item_type IN ('PHONE', 'ACCESSORY')),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        default_price REAL NOT NULL,
        requested_price REAL NOT NULL,
        discount_amount REAL NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'EXPIRED')),
        requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        approved_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
        approved_amount REAL,
        rejection_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        reviewed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_discount_requests_shop ON discount_requests(shop_id, status);

      -- 5. Credit Limit Overrides (Admin approval workflow)
      CREATE TABLE IF NOT EXISTS credit_limit_overrides (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        customer_name TEXT NOT NULL,
        sale_amount REAL NOT NULL,
        credit_limit REAL NOT NULL,
        current_balance REAL NOT NULL,
        excess_amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'USED')),
        requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        approved_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        reviewed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_credit_overrides_shop ON credit_limit_overrides(shop_id, status);

      -- 6. Sales (Completed permanent transactions)
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        invoice_no TEXT NOT NULL,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        customer_cnic_encrypted TEXT,
        customer_cnic_masked TEXT,
        subtotal REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0.0,
        discount_request_id TEXT REFERENCES discount_requests(id) ON DELETE SET NULL,
        tax_rate REAL NOT NULL DEFAULT 0.0,
        tax_amount REAL NOT NULL DEFAULT 0.0,
        total_amount REAL NOT NULL,
        amount_paid REAL NOT NULL DEFAULT 0.0,
        balance_due REAL NOT NULL DEFAULT 0.0,
        total_cost REAL NOT NULL,
        gross_profit REAL NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'PAID' CHECK(payment_status IN ('PAID', 'PARTIALLY_PAID', 'UNPAID', 'OVERDUE')),
        due_date TEXT,
        shopkeeper_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        shopkeeper_name TEXT NOT NULL,
        shop_snapshot TEXT NOT NULL,
        notes TEXT,
        is_reversed INTEGER NOT NULL DEFAULT 0,
        reversed_at TEXT,
        reversed_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
        reversal_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, invoice_no)
      );
      CREATE INDEX IF NOT EXISTS idx_sales_shop_invoice ON sales(shop_id, invoice_no);
      CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
      CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(shop_id, payment_status);

      -- 7. Sale Items (Historical immutable line items)
      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL CHECK(item_type IN ('PHONE', 'ACCESSORY')),
        phone_id TEXT REFERENCES phone_inventory(id) ON DELETE SET NULL,
        accessory_id TEXT REFERENCES accessories(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        identifier TEXT,
        imei2 TEXT,
        specs TEXT,
        condition TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_cost REAL NOT NULL,
        default_price REAL NOT NULL,
        actual_price REAL NOT NULL,
        discount REAL NOT NULL DEFAULT 0.0,
        subtotal REAL NOT NULL,
        profit REAL NOT NULL,
        fifo_batch_allocations TEXT,
        warranty_months INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_phone ON sale_items(phone_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_accessory ON sale_items(accessory_id);

      -- 8. Sale Payments (Split / multi-method payment entries)
      CREATE TABLE IF NOT EXISTS sale_payments (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'BANK_TRANSFER', 'CARD', 'JAZZCASH', 'EASYPAISA', 'CRYPTO_BTC', 'CRYPTO_USDT', 'CRYPTO_ETH', 'CUSTOM')),
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        exchange_rate REAL DEFAULT 1.0,
        transaction_reference TEXT,
        notes TEXT,
        recorded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);

      -- 9. Customer Payment Receipts (Later payments on credit invoices)
      CREATE TABLE IF NOT EXISTS customer_payment_receipts (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        receipt_no TEXT NOT NULL,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        payment_method TEXT NOT NULL,
        amount_received REAL NOT NULL,
        previous_balance REAL NOT NULL,
        remaining_balance REAL NOT NULL,
        transaction_reference TEXT,
        notes TEXT,
        received_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, receipt_no)
      );
      CREATE INDEX IF NOT EXISTS idx_receipts_shop ON customer_payment_receipts(shop_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_sale ON customer_payment_receipts(sale_id);

      -- 10. Returns and Return Items
      CREATE TABLE IF NOT EXISTS returns (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        return_no TEXT NOT NULL,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        return_type TEXT NOT NULL CHECK(return_type IN ('REFUND', 'EXCHANGE')),
        total_refund_amount REAL NOT NULL,
        reason TEXT NOT NULL,
        processed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, return_no)
      );
      CREATE INDEX IF NOT EXISTS idx_returns_shop ON returns(shop_id);

      CREATE TABLE IF NOT EXISTS return_items (
        id TEXT PRIMARY KEY,
        return_id TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        sale_item_id TEXT NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
        item_type TEXT NOT NULL CHECK(item_type IN ('PHONE', 'ACCESSORY')),
        phone_id TEXT REFERENCES phone_inventory(id) ON DELETE SET NULL,
        accessory_id TEXT REFERENCES accessories(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        identifier TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_refund_amount REAL NOT NULL,
        restored_cost REAL NOT NULL,
        restored_to_inventory INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);

      -- 11. Exchanges
      CREATE TABLE IF NOT EXISTS exchanges (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        return_id TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
        new_sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
        returned_items_value REAL NOT NULL,
        new_items_value REAL NOT NULL,
        difference_amount REAL NOT NULL,
        difference_type TEXT NOT NULL CHECK(difference_type IN ('CUSTOMER_PAYS', 'SHOP_REFUNDS', 'EVEN')),
        payment_method TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- 12. Warranty Records
      CREATE TABLE IF NOT EXISTS warranty_records (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        sale_item_id TEXT NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        item_type TEXT NOT NULL CHECK(item_type IN ('PHONE', 'ACCESSORY')),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        identifier TEXT,
        warranty_type TEXT NOT NULL CHECK(warranty_type IN ('MANUFACTURER', 'SUPPLIER', 'SHOP')),
        provider_name TEXT NOT NULL,
        duration_months INTEGER NOT NULL DEFAULT 12,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        terms TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'CLAIMED', 'EXPIRED', 'VOID')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_warranty_shop ON warranty_records(shop_id);
      CREATE INDEX IF NOT EXISTS idx_warranty_identifier ON warranty_records(shop_id, identifier);

      -- 13. Warranty Claims
      CREATE TABLE IF NOT EXISTS warranty_claims (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        claim_ref TEXT NOT NULL,
        warranty_id TEXT NOT NULL REFERENCES warranty_records(id) ON DELETE RESTRICT,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        problem_description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK(status IN ('REGISTERED', 'UNDER_INSPECTION', 'APPROVED', 'REJECTED', 'SENT_TO_SUPPLIER', 'UNDER_REPAIR', 'REPAIRED', 'REPLACEMENT', 'REFUND', 'READY_FOR_COLLECTION', 'DELIVERED', 'CLOSED')),
        repair_notes TEXT,
        parts_used TEXT,
        labor_cost REAL DEFAULT 0.0,
        customer_charge REAL DEFAULT 0.0,
        replacement_phone_id TEXT REFERENCES phone_inventory(id) ON DELETE SET NULL,
        replacement_imei TEXT,
        registered_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        resolved_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(shop_id, claim_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_warranty_claims_shop ON warranty_claims(shop_id, status);

      -- 14. Product Labels
      CREATE TABLE IF NOT EXISTS product_labels (
        id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL CHECK(item_type IN ('PHONE', 'ACCESSORY')),
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        identifier TEXT NOT NULL,
        label_format TEXT NOT NULL DEFAULT 'STANDARD_38x25',
        barcode_type TEXT NOT NULL DEFAULT 'CODE128',
        qr_code_data TEXT,
        barcode_data TEXT,
        printed_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};
