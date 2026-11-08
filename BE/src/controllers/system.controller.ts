import { Request, Response } from 'express';
import { systemService } from '../services/system.service';

export const systemController = {
  getHealth(_req: Request, res: Response): void {
    const health = systemService.getHealthStatus();
    res.status(health.status === 'ok' ? 200 : 503).json(health);
  },

  getVersion(_req: Request, res: Response): void {
    const version = systemService.getVersionInfo();
    res.status(200).json(version);
  },
};
