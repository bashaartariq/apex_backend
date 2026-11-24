import crypto from 'crypto';
import { env } from '../config/env';

// Derive a 32-byte key for AES-256-GCM encryption of customer PII data at rest
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.CNIC_ENCRYPTION_SECRET || 'antigravity-pos-secure-key').digest();
const ALGORITHM = 'aes-256-gcm';

/**
 * Validates a CNIC string (allows either 13 raw digits or 5-7-1 hyphenated format)
 */
export function validateCnic(cnic: string): boolean {
  if (!cnic) return false;
  const cleaned = cnic.trim().replace(/-/g, '');
  return /^\d{13}$/.test(cleaned);
}

/**
 * Normalizes CNIC to standard format: XXXXX-XXXXXXX-X
 */
export function normalizeCnic(cnic: string): string {
  const cleaned = cnic.trim().replace(/-/g, '');
  if (cleaned.length !== 13) return cnic.trim();
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5, 12)}-${cleaned.slice(12, 13)}`;
}

/**
 * Masks CNIC for privacy in routine views: XXXXX-*******-*
 */
export function maskCnic(cnic: string): string {
  const norm = normalizeCnic(cnic);
  if (!norm || norm.length < 15) return '***-*******-*';
  return `${norm.slice(0, 6)}*******${norm.slice(13)}`;
}

/**
 * Generates deterministic HMAC-SHA256 hash for tenant-isolated unique constraint
 */
export function hashCnic(cnic: string): string {
  const norm = normalizeCnic(cnic);
  return crypto.createHmac('sha256', ENCRYPTION_KEY).update(norm).digest('hex');
}

/**
 * Encrypts CNIC string using AES-256-GCM
 */
export function encryptCnic(cnic: string): string {
  const norm = normalizeCnic(cnic);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(norm, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine iv + authTag + encrypted ciphertext in base64url format
  return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

/**
 * Decrypts CNIC string
 */
export function decryptCnic(encryptedPayload: string): string {
  try {
    const parts = encryptedPayload.split('.');
    if (parts.length !== 3) return encryptedPayload;

    const iv = Buffer.from(parts[0], 'base64url');
    const authTag = Buffer.from(parts[1], 'base64url');
    const encrypted = Buffer.from(parts[2], 'base64url');

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return 'Invalid / Unreadable CNIC';
  }
}
