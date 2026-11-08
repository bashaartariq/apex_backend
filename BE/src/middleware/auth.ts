import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/tokens';
import { queryAll, queryOne } from '../database/query';
import { AppError } from './errorHandler';

export interface AuthenticatedUser {
  id: string;
  shopId: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'SHOP_ADMIN' | 'SHOPKEEPER';
  status: 'ACTIVE' | 'INACTIVE';
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }
  return null;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);

  if (!token) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication credentials are required.'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    // Look up active user in the database
    const userRow = queryOne<{
      id: string;
      shop_id: string;
      name: string;
      email: string;
      phone: string | null;
      role: 'SHOP_ADMIN' | 'SHOPKEEPER';
      status: 'ACTIVE' | 'INACTIVE';
      shop_status: 'ACTIVE' | 'SUSPENDED';
    }>(
      `SELECT u.id, u.shop_id, u.name, u.email, u.phone, u.role, u.status, s.status as shop_status
       FROM users u
       JOIN shops s ON s.id = u.shop_id
       WHERE u.id = ?`,
      [payload.userId]
    );

    if (!userRow) {
      next(new AppError(401, 'USER_NOT_FOUND', 'User account does not exist.'));
      return;
    }

    if (userRow.status !== 'ACTIVE') {
      next(new AppError(403, 'USER_INACTIVE', 'Your account has been deactivated by your shop administrator.'));
      return;
    }

    if (userRow.shop_status !== 'ACTIVE') {
      next(new AppError(403, 'SHOP_SUSPENDED', 'This shop tenant account is currently suspended.'));
      return;
    }

    // Load assigned permissions
    let permissions: string[] = [];
    if (userRow.role === 'SHOP_ADMIN') {
      // SHOP_ADMIN implicitly has all active permissions
      const allPermRows = queryAll<{ id: string }>('SELECT id FROM permissions');
      permissions = allPermRows.map((r) => r.id);
    } else {
      const permRows = queryAll<{ permission_id: string }>(
        'SELECT permission_id FROM user_permissions WHERE user_id = ?',
        [userRow.id]
      );
      permissions = permRows.map((r) => r.permission_id);
    }

    req.user = {
      id: userRow.id,
      shopId: userRow.shop_id,
      name: userRow.name,
      email: userRow.email,
      phone: userRow.phone,
      role: userRow.role,
      status: userRow.status,
      permissions,
    };

    // Force tenantContext to derive exclusively from the verified user session
    req.tenantContext = {
      shopId: userRow.shop_id,
    };

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      next(new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please sign in again.'));
      return;
    }
    next(new AppError(401, 'INVALID_TOKEN', 'Invalid or tampered authentication token.'));
  }
}
