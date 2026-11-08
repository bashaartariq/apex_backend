import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export function requireRole(...allowedRoles: Array<'SHOP_ADMIN' | 'SHOPKEEPER'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new AppError(403, 'FORBIDDEN_ROLE', `Access denied. Requires one of: ${allowedRoles.join(', ')}`));
      return;
    }

    next();
  };
}

export function requirePermission(permissionId: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
      return;
    }

    // Shop Admin has comprehensive authority over their tenant
    if (req.user.role === 'SHOP_ADMIN') {
      next();
      return;
    }

    if (!req.user.permissions.includes(permissionId)) {
      next(
        new AppError(
          403,
          'PERMISSION_DENIED',
          `You do not have permission (${permissionId}) to perform this action. Contact your shop administrator.`
        )
      );
      return;
    }

    next();
  };
}
