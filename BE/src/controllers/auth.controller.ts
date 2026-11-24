import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { queryOne, execute, withTransaction, queryAll } from '../database/query';
import { hashPassword, comparePassword, validatePasswordStrength } from '../utils/password';
import { generateAccessToken, createRefreshToken, verifyAndRevokeRefreshToken } from '../utils/tokens';
import { AppError } from '../middleware/errorHandler';

export const registerSchema = z.object({
  shopName: z.string().trim().min(2, 'Shop name must be at least 2 characters'),
  ownerName: z.string().trim().min(2, 'Owner name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  phone: z.string().trim().min(5, 'Phone number must be at least 5 digits'),
  address: z.string().trim().min(3, 'Shop address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

function getCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax' as const,
    maxAge: maxAgeMs,
    path: '/',
  };
}

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = registerSchema.parse(req.body);

      // Validate password strength
      const strength = validatePasswordStrength(data.password);
      if (!strength.isValid) {
        throw new AppError(400, 'WEAK_PASSWORD', strength.message || 'Password does not meet security requirements.');
      }

      // Check if email already registered across users or shops
      const existingUser = queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', [data.email]);
      if (existingUser) {
        throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email address already exists.');
      }

      const shopId = 'shop_' + crypto.randomUUID();
      const userId = 'user_' + crypto.randomUUID();
      const passwordHash = await hashPassword(data.password);
      const nowIso = new Date().toISOString();

      // Atomic creation of Tenant (Shop) and Owner (SHOP_ADMIN)
      withTransaction((db) => {
        // 1. Create Shop record
        execute(
          `INSERT INTO shops (id, name, owner_name, email, phone, address, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
          [shopId, data.shopName, data.ownerName, data.email, data.phone, data.address, nowIso, nowIso],
          db
        );

        // 2. Create Owner User
        execute(
          `INSERT INTO users (id, shop_id, name, email, password_hash, phone, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'SHOP_ADMIN', 'ACTIVE', ?, ?)`,
          [userId, shopId, data.ownerName, data.email, passwordHash, data.phone, nowIso, nowIso],
          db
        );
      });

      // Issue tokens
      const accessToken = generateAccessToken({
        userId,
        shopId,
        role: 'SHOP_ADMIN',
        email: data.email,
      });

      const { rawToken: refreshToken } = createRefreshToken(userId);

      // Set cookies
      res.cookie('access_token', accessToken, getCookieOptions(15 * 60 * 1000));
      res.cookie('refresh_token', refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

      const allPerms = queryAll<{ id: string }>('SELECT id FROM permissions');

      res.status(201).json({
        success: true,
        message: 'Shop registration successful. Welcome to your new workspace!',
        accessToken,
        user: {
          id: userId,
          shopId,
          name: data.ownerName,
          email: data.email,
          phone: data.phone,
          role: 'SHOP_ADMIN',
          status: 'ACTIVE',
          permissions: allPerms.map((p) => p.id),
        },
        shop: {
          id: shopId,
          name: data.shopName,
          ownerName: data.ownerName,
          email: data.email,
          phone: data.phone,
          address: data.address,
          status: 'ACTIVE',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = loginSchema.parse(req.body);

      const user = queryOne<{
        id: string;
        shop_id: string;
        name: string;
        email: string;
        password_hash: string;
        phone: string | null;
        role: 'SHOP_ADMIN' | 'SHOPKEEPER';
        status: 'ACTIVE' | 'INACTIVE';
      }>('SELECT * FROM users WHERE email = ?', [data.email]);

      if (!user) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email address or password.');
      }

      if (user.status !== 'ACTIVE') {
        throw new AppError(403, 'USER_INACTIVE', 'Your account has been deactivated. Contact your shop administrator.');
      }

      const shop = queryOne<{
        id: string;
        name: string;
        owner_name: string;
        email: string;
        phone: string;
        address: string;
        status: 'ACTIVE' | 'SUSPENDED';
      }>('SELECT * FROM shops WHERE id = ?', [user.shop_id]);

      if (!shop || shop.status !== 'ACTIVE') {
        throw new AppError(403, 'SHOP_SUSPENDED', 'Your shop subscription or account is inactive.');
      }

      const passwordsMatch = await comparePassword(data.password, user.password_hash);
      if (!passwordsMatch) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email address or password.');
      }

      const accessToken = generateAccessToken({
        userId: user.id,
        shopId: user.shop_id,
        role: user.role,
        email: user.email,
      });

      const { rawToken: refreshToken } = createRefreshToken(user.id);

      // Set cookies
      res.cookie('access_token', accessToken, getCookieOptions(15 * 60 * 1000));
      res.cookie('refresh_token', refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

      // Fetch permissions
      let permissions: string[] = [];
      if (user.role === 'SHOP_ADMIN') {
        const allPerms = queryAll<{ id: string }>('SELECT id FROM permissions');
        permissions = allPerms.map((p) => p.id);
      } else {
        const permRows = queryAll<{ permission_id: string }>(
          'SELECT permission_id FROM user_permissions WHERE user_id = ?',
          [user.id]
        );
        permissions = permRows.map((p) => p.permission_id);
      }

      res.status(200).json({
        success: true,
        message: 'Signed in successfully.',
        accessToken,
        user: {
          id: user.id,
          shopId: user.shop_id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          permissions,
        },
        shop: {
          id: shop.id,
          name: shop.name,
          ownerName: shop.owner_name,
          email: shop.email,
          phone: shop.phone,
          address: shop.address,
          status: shop.status,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated.');
      }

      const shop = queryOne<{
        id: string;
        name: string;
        owner_name: string;
        email: string;
        phone: string;
        address: string;
        status: string;
      }>('SELECT * FROM shops WHERE id = ?', [req.user.shopId]);

      res.status(200).json({
        success: true,
        user: req.user,
        shop: shop ? { ...shop, ownerName: shop.owner_name } : null,
      });
    } catch (err) {
      next(err);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawToken = req.cookies?.refresh_token || req.body?.refreshToken;

      if (!rawToken) {
        throw new AppError(400, 'MISSING_REFRESH_TOKEN', 'No refresh token provided.');
      }

      const verification = verifyAndRevokeRefreshToken(rawToken);
      if (!verification) {
        // Clear invalid cookies
        res.clearCookie('access_token', { path: '/' });
        res.clearCookie('refresh_token', { path: '/' });
        throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session refresh expired or invalid. Please sign in again.');
      }

      const user = queryOne<{
        id: string;
        shop_id: string;
        email: string;
        role: 'SHOP_ADMIN' | 'SHOPKEEPER';
        status: string;
      }>('SELECT id, shop_id, email, role, status FROM users WHERE id = ?', [verification.userId]);

      if (!user || user.status !== 'ACTIVE') {
        throw new AppError(403, 'USER_INACTIVE', 'User account is not active.');
      }

      // Rotate both access token and refresh token
      const newAccessToken = generateAccessToken({
        userId: user.id,
        shopId: user.shop_id,
        role: user.role,
        email: user.email,
      });

      const { rawToken: newRefreshToken } = createRefreshToken(user.id);

      res.cookie('access_token', newAccessToken, getCookieOptions(15 * 60 * 1000));
      res.cookie('refresh_token', newRefreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

      res.status(200).json({
        success: true,
        accessToken: newAccessToken,
      });
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawToken = req.cookies?.refresh_token || req.body?.refreshToken;
      if (rawToken) {
        verifyAndRevokeRefreshToken(rawToken);
      }

      // Clear cookies
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: '/' });

      res.status(200).json({
        success: true,
        message: 'Logged out successfully.',
      });
    } catch (err) {
      next(err);
    }
  }
}
