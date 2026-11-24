import Database from 'better-sqlite3';
import { getDatabase } from '../config/database';

export function getNextInvoiceNumber(shopId: string, db?: Database.Database): string {
  const conn = db || getDatabase();
  const row = conn.prepare(`
    INSERT INTO invoice_sequences (id, shop_id, current_number, prefix, created_at, updated_at)
    VALUES (?, ?, 1, 'INV', datetime('now'), datetime('now'))
    ON CONFLICT(shop_id) DO UPDATE SET
      current_number = invoice_sequences.current_number + 1,
      updated_at = datetime('now')
    RETURNING current_number, prefix
  `).get(`seq_inv_${shopId}`, shopId) as { current_number: number; prefix: string };

  const padded = String(row.current_number).padStart(6, '0');
  return `${row.prefix}-${padded}`;
}

export function getNextReceiptNumber(shopId: string, db?: Database.Database): string {
  const conn = db || getDatabase();
  const row = conn.prepare(`
    INSERT INTO receipt_sequences (id, shop_id, current_number, prefix, created_at, updated_at)
    VALUES (?, ?, 1, 'REC', datetime('now'), datetime('now'))
    ON CONFLICT(shop_id) DO UPDATE SET
      current_number = receipt_sequences.current_number + 1,
      updated_at = datetime('now')
    RETURNING current_number, prefix
  `).get(`seq_rec_${shopId}`, shopId) as { current_number: number; prefix: string };

  const padded = String(row.current_number).padStart(6, '0');
  return `${row.prefix}-${padded}`;
}

export function getNextReturnNumber(shopId: string, db?: Database.Database): string {
  const conn = db || getDatabase();
  const countRow = conn.prepare(`SELECT COUNT(*) as cnt FROM returns WHERE shop_id = ?`).get(shopId) as { cnt: number };
  const nextNum = (countRow.cnt || 0) + 1;
  return `RET-${String(nextNum).padStart(6, '0')}`;
}

export function getNextClaimRef(shopId: string, db?: Database.Database): string {
  const conn = db || getDatabase();
  const countRow = conn.prepare(`SELECT COUNT(*) as cnt FROM warranty_claims WHERE shop_id = ?`).get(shopId) as { cnt: number };
  const nextNum = (countRow.cnt || 0) + 1;
  return `CLM-${String(nextNum).padStart(6, '0')}`;
}
