import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { execute, queryOne } from '../database/query';

export interface TokenPayload {
  userId: string;
  shopId: string;
  role: 'SHOP_ADMIN' | 'SHOPKEEPER';
  email: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtExpiresIn as any,
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as TokenPayload;
}

export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function createRefreshToken(userId: string): { rawToken: string; expiresAt: Date } {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashRefreshToken(rawToken);
  
  // 7 days expiration
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  
  const tokenId = 'rt_' + crypto.randomUUID();
  execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [tokenId, userId, tokenHash, expiresAt.toISOString(), new Date().toISOString()]
  );

  return { rawToken, expiresAt };
}

export function verifyAndRevokeRefreshToken(rawToken: string): { userId: string } | null {
  const tokenHash = hashRefreshToken(rawToken);
  const nowIso = new Date().toISOString();

  const record = queryOne<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
    `SELECT id, user_id, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token_hash = ?`,
    [tokenHash]
  );

  if (!record || record.revoked_at || new Date(record.expires_at) <= new Date(nowIso)) {
    return null;
  }

  // Revoke used refresh token for rotation
  execute(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?`,
    [nowIso, record.id]
  );

  return { userId: record.user_id };
}

export function revokeUserRefreshTokens(userId: string): void {
  execute(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
    [new Date().toISOString(), userId]
  );
}
