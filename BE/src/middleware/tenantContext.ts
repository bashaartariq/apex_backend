import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export interface TenantContext {
  shopId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}

/**
 * Attaches multi-tenant context foundation to incoming requests.
 * In later steps, authenticated session/token resolution will populate shopId authoritatively.
 */
export function attachTenantContext(req: Request, _res: Response, next: NextFunction): void {
  const headerValue = req.header('X-Shop-Id');
  const shopId = headerValue && headerValue.trim().length > 0 ? headerValue.trim() : null;

  req.tenantContext = { shopId };
  next();
}

/**
 * Guard middleware ready for future shop-scoped routes.
 */
export function requireTenantContext(req: Request, _res: Response, next: NextFunction): void {
  if (!req.tenantContext?.shopId) {
    next(new AppError(400, 'TENANT_CONTEXT_REQUIRED', 'Active shop context (shop_id) is required.'));
    return;
  }
  next();
}
