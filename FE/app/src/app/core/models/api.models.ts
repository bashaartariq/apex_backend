export interface HealthStatusResponse {
  success: boolean;
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  database: {
    connected: boolean;
    engine: 'sqlite';
    foreignKeysEnabled: boolean;
    appliedMigrations: number;
  };
  tenancy: {
    mode: 'shared-database';
    discriminator: 'shop_id';
  };
}

export interface VersionInfoResponse {
  success: boolean;
  name: string;
  version: string;
  apiPrefix: string;
  stage: string;
  environment: string;
  nodeVersion: string;
}

export interface ApiErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface NormalizedApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}
