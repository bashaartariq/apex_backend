import Database from 'better-sqlite3';
import { Migration } from './001_init_infrastructure';

export const migration005ReportingIndexes: Migration = {
  id: '005_reporting_indexes',
  description: 'Add composite indexes for high-performance dashboard analytics, date filtering and report aggregations',
  up(db: Database.Database): void {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sales_shop_date ON sales(shop_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sales_shop_status_date ON sales(shop_id, payment_status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_purchases_shop_date ON purchases(shop_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_purchases_shop_status_date ON purchases(shop_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_returns_shop_date ON returns(shop_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_receipts_shop_date ON customer_payment_receipts(shop_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_phone_inv_shop_status ON phone_inventory(shop_id, status);
      CREATE INDEX IF NOT EXISTS idx_batches_acc_remaining ON accessory_batches(shop_id, accessory_id, remaining_quantity);
    `);
  },
};
