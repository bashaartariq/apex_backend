import { Request, Response, NextFunction } from 'express';
import { queryAll } from '../database/query';

export class PermissionsController {
  static async listPermissions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const permissions = queryAll<{
        id: string;
        name: string;
        module: string;
        description: string;
      }>('SELECT id, name, module, description FROM permissions ORDER BY module ASC, id ASC');

      res.status(200).json({
        success: true,
        data: permissions,
      });
    } catch (err) {
      next(err);
    }
  }
}
