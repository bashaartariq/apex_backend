import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from BE/ directory first, falling back to monorepo root .env if present
const backendEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/mobile_shop.sqlite'),
  FRONTEND_URL: z.string().min(1).default('http://localhost:4200'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment configuration:', parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

const backendRoot = path.resolve(__dirname, '../..');
const resolvedDbPath = path.isAbsolute(parsedEnv.data.DATABASE_PATH)
  ? parsedEnv.data.DATABASE_PATH
  : path.resolve(backendRoot, parsedEnv.data.DATABASE_PATH);

export const env = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  port: parsedEnv.data.PORT,
  databasePath: resolvedDbPath,
  frontendUrl: parsedEnv.data.FRONTEND_URL,
} as const;
