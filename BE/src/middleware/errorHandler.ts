import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Maps SQLite constraint errors to structured, user-friendly responses.
 * Never exposes SQL queries, table definitions, or internal file paths.
 */
function handleSqliteError(err: any): { status: number; code: string; message: string; details?: unknown } | null {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');

  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || msg.includes('UNIQUE constraint failed')) {
    if (msg.includes('imei1') || msg.includes('imei2')) {
      return {
        status: 409,
        code: 'DUPLICATE_IMEI',
        message: 'A phone with this IMEI number is already registered in your shop.',
      };
    }
    if (msg.includes('sku')) {
      return {
        status: 409,
        code: 'DUPLICATE_SKU',
        message: 'An accessory with this SKU code already exists in your inventory.',
      };
    }
    if (msg.includes('cnic_hash') || msg.includes('cnic')) {
      return {
        status: 409,
        code: 'DUPLICATE_CNIC',
        message: 'A customer with this CNIC number is already registered in your shop.',
      };
    }
    if (msg.includes('email')) {
      return {
        status: 409,
        code: 'DUPLICATE_EMAIL',
        message: 'An account with this email address already exists.',
      };
    }
    if (msg.includes('reference_no')) {
      return {
        status: 409,
        code: 'DUPLICATE_REFERENCE',
        message: 'A purchase order with this reference number already exists.',
      };
    }
    if (msg.includes('name') && (msg.includes('accessory_categories') || msg.includes('category'))) {
      return {
        status: 409,
        code: 'DUPLICATE_CATEGORY',
        message: 'An accessory category with this name already exists in your shop.',
      };
    }
    return {
      status: 409,
      code: 'DUPLICATE_RECORD',
      message: 'A record with these details already exists.',
    };
  }

  if (code === 'SQLITE_CONSTRAINT_CHECK' || msg.includes('CHECK constraint failed')) {
    if (msg.includes('available_quantity') || msg.includes('quantity')) {
      return {
        status: 400,
        code: 'INVALID_QUANTITY',
        message: 'Stock quantity cannot be negative.',
      };
    }
    if (msg.includes('purchase_cost') || msg.includes('selling_price') || msg.includes('price')) {
      return {
        status: 400,
        code: 'INVALID_PRICE',
        message: 'Price and cost values cannot be negative.',
      };
    }
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Please ensure all submitted numbers and values are within valid ranges.',
    };
  }

  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || msg.includes('FOREIGN KEY constraint failed')) {
    return {
      status: 400,
      code: 'INVALID_REFERENCE',
      message: 'The selected item or supplier does not exist or has been removed.',
    };
  }

  return null;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Explicit Application Business Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // 2. Zod Schema Validation Errors
  if (err instanceof ZodError) {
    const flattened = err.flatten();
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
      if (messages && messages.length > 0) {
        fieldErrors[field] = messages[0];
      }
    }

    const firstIssue = err.issues[0];
    const primaryMessage = firstIssue?.message || 'Please check the highlighted form fields and try again.';

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: primaryMessage,
        fieldErrors,
        details: flattened,
      },
    });
    return;
  }

  // 3. SQLite Constraint & Database Errors
  const sqliteError = handleSqliteError(err);
  if (sqliteError) {
    res.status(sqliteError.status).json({
      success: false,
      error: {
        code: sqliteError.code,
        message: sqliteError.message,
        ...(sqliteError.details !== undefined ? { details: sqliteError.details } : {}),
      },
    });
    return;
  }

  // 4. Malformed JSON Body
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status?: number }).status === 400 &&
    'body' in err
  ) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed request payload. Please check your data format.',
      },
    });
    return;
  }

  // 5. Unhandled / Unexpected Server Errors (sanitize & protect sensitive information)
  logger.error('Unhandled request error', {
    method: req.method,
    path: req.originalUrl,
    error: err instanceof Error ? err.stack || err.message : String(err),
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    },
  });
}
