import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { queryAll, queryOne, execute, withTransaction } from '../database/query';
import { hashPassword, validatePasswordStrength } from '../utils/password';
import { AppError } from '../middleware/errorHandler';

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(['SHOP_ADMIN', 'SHOPKEEPER']).default('SHOPKEEPER'),
  permissions: z.array(z.string()).optional().default([]),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(['SHOP_ADMIN', 'SHOPKEEPER']).optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const updatePermissionsSchema = z.object({
  permissions: z.array(z.string()),
});

export class UsersController {
  /**
   * List all users for the authenticated shop.
   * Cross-tenant barrier: strictly filtered by req.user.shopId.
   */
  static async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const users = queryAll<{
        id: string;
        shop_id: string;
        name: string;
        email: string;
        phone: string | null;
        role: 'SHOP_ADMIN' | 'SHOPKEEPER';
        status: 'ACTIVE' | 'INACTIVE';
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, shop_id, name, email, phone, role, status, created_at, updated_at
         FROM users
         WHERE shop_id = ?
         ORDER BY created_at DESC`,
        [req.user.shopId]
      );

      // Attach permission counts or array for each user
      const usersWithPerms = users.map((u) => {
        let perms: string[] = [];
        if (u.role === 'SHOP_ADMIN') {
          perms = ['*'];
        } else {
          const permRows = queryAll<{ permission_id: string }>(
            'SELECT permission_id FROM user_permissions WHERE user_id = ?',
            [u.id]
          );
          perms = permRows.map((r) => r.permission_id);
        }
        return {
          ...u,
          permissions: perms,
        };
      });

      res.status(200).json({
        success: true,
        data: usersWithPerms,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create a new shopkeeper user within the authenticated shop.
   */
  static async createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const data = createUserSchema.parse(req.body);

      const strength = validatePasswordStrength(data.password);
      if (!strength.isValid) {
        throw new AppError(400, 'WEAK_PASSWORD', strength.message || 'Password does not meet complexity rules.');
      }

      // Check email uniqueness across users
      const existing = queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', [data.email]);
      if (existing) {
        throw new AppError(409, 'EMAIL_EXISTS', 'A user with this email address already exists.');
      }

      const userId = 'user_' + crypto.randomUUID();
      const passwordHash = await hashPassword(data.password);
      const nowIso = new Date().toISOString();

      withTransaction((db) => {
        execute(
          `INSERT INTO users (id, shop_id, name, email, password_hash, phone, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
          [userId, req.user!.shopId, data.name, data.email, passwordHash, data.phone || null, data.role, nowIso, nowIso],
          db
        );

        if (data.role === 'SHOPKEEPER' && data.permissions.length > 0) {
          const insertPermStmt = db.prepare(
            'INSERT INTO user_permissions (user_id, permission_id, assigned_at) VALUES (?, ?, ?)'
          );
          for (const permId of data.permissions) {
            insertPermStmt.run(userId, permId, nowIso);
          }
        }
      });

      res.status(201).json({
        success: true,
        message: 'Staff member added successfully.',
        data: {
          id: userId,
          shopId: req.user.shopId,
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          role: data.role,
          status: 'ACTIVE',
          permissions: data.permissions,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get a single user by ID.
   * Enforces shop isolation: cannot fetch user belonging to another shop.
   */
  static async getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const { id } = req.params;

      const user = queryOne<{
        id: string;
        shop_id: string;
        name: string;
        email: string;
        phone: string | null;
        role: 'SHOP_ADMIN' | 'SHOPKEEPER';
        status: 'ACTIVE' | 'INACTIVE';
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, shop_id, name, email, phone, role, status, created_at, updated_at
         FROM users
         WHERE id = ? AND shop_id = ?`,
        [id, req.user.shopId]
      );

      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found in your shop.');
      }

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
        data: {
          ...user,
          permissions,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update a user's details.
   */
  static async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const { id } = req.params;
      const data = updateUserSchema.parse(req.body);

      // Verify user exists in the authenticated shop
      const user = queryOne<{ id: string; role: string }>(
        'SELECT id, role FROM users WHERE id = ? AND shop_id = ?',
        [id, req.user.shopId]
      );

      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found in your shop.');
      }

      const nowIso = new Date().toISOString();
      const newRole = data.role || user.role;

      execute(
        `UPDATE users
         SET name = ?, phone = ?, role = ?, updated_at = ?
         WHERE id = ? AND shop_id = ?`,
        [data.name, data.phone || null, newRole, nowIso, id, req.user.shopId]
      );

      const updated = queryOne<{
        id: string;
        shop_id: string;
        name: string;
        email: string;
        phone: string | null;
        role: string;
        status: string;
        updated_at: string;
      }>(
        `SELECT id, shop_id, name, email, phone, role, status, updated_at
         FROM users
         WHERE id = ? AND shop_id = ?`,
        [id, req.user.shopId]
      );

      res.status(200).json({
        success: true,
        message: 'User updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Toggle or set user active/inactive status.
   */
  static async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const { id } = req.params;
      const { status } = updateStatusSchema.parse(req.body);

      // Prevent deactivating own account
      if (id === req.user.id && status === 'INACTIVE') {
        throw new AppError(400, 'SELF_DEACTIVATION_PROHIBITED', 'You cannot deactivate your own administrative account.');
      }

      // Check user exists in this shop
      const user = queryOne<{ id: string; role: string }>(
        'SELECT id, role FROM users WHERE id = ? AND shop_id = ?',
        [id, req.user.shopId]
      );

      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found in your shop.');
      }

      const nowIso = new Date().toISOString();
      execute(
        `UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND shop_id = ?`,
        [status, nowIso, id, req.user.shopId]
      );

      res.status(200).json({
        success: true,
        message: `User status successfully updated to ${status}.`,
        data: { id, status },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get permissions assigned to a user.
   */
  static async getUserPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const { id } = req.params;

      const user = queryOne<{ id: string; role: string }>(
        'SELECT id, role FROM users WHERE id = ? AND shop_id = ?',
        [id, req.user.shopId]
      );

      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found in your shop.');
      }

      if (user.role === 'SHOP_ADMIN') {
        const allPerms = queryAll<{ id: string }>('SELECT id FROM permissions');
        res.status(200).json({
          success: true,
          data: allPerms.map((p) => p.id),
        });
        return;
      }

      const perms = queryAll<{ permission_id: string }>(
        'SELECT permission_id FROM user_permissions WHERE user_id = ?',
        [id]
      );

      res.status(200).json({
        success: true,
        data: perms.map((p) => p.permission_id),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update permissions for a shopkeeper.
   */
  static async updateUserPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const { id } = req.params;
      const { permissions } = updatePermissionsSchema.parse(req.body);

      const user = queryOne<{ id: string; role: string }>(
        'SELECT id, role FROM users WHERE id = ? AND shop_id = ?',
        [id, req.user.shopId]
      );

      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'User not found in your shop.');
      }

      const nowIso = new Date().toISOString();

      withTransaction((db) => {
        // Remove existing custom permissions
        execute('DELETE FROM user_permissions WHERE user_id = ?', [id], db);

        // Insert new permissions
        const insertStmt = db.prepare(
          'INSERT INTO user_permissions (user_id, permission_id, assigned_at) VALUES (?, ?, ?)'
        );
        for (const permId of permissions) {
          insertStmt.run(id, permId, nowIso);
        }
      });

      res.status(200).json({
        success: true,
        message: 'Permissions updated successfully.',
        data: {
          userId: id,
          permissions,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
