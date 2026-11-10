import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

const isTestEnv = process.env.NODE_ENV === 'test';
const envFile = isTestEnv ? '.env.test' : '.env';
// `override: true` is required here: importing `@prisma/client` anywhere in the
// require graph (even transitively, before this module runs) triggers Prisma's
// own bundled auto-loader for the plain `.env` file as a side effect. Without
// forcing an override, dotenv's "don't clobber an existing var" default would
// silently keep Prisma's `.env` value instead of ours, so `NODE_ENV=test` could
// end up running against the *development* database. Only override in test
// mode - in dev/production we still want real OS-injected env vars to win.
dotenv.config({ path: path.resolve(process.cwd(), envFile), override: isTestEnv });
dotenv.config(); // fall back to .env for any keys envFile didn't set

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  ADMIN_URL: z.string().default('http://localhost:5174'),
  // Public base URL of this API (e.g. https://api.kilf.in). Used for the Swagger
  // server entry; falls back to http://localhost:PORT when unset.
  API_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(10, 'JWT_SECRET must be set to a strong value'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(10, 'JWT_REFRESH_SECRET must be set to a strong value'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  PAYMENT_PROVIDER: z.enum(['mock', 'stripe', 'razorpay']).default('mock'),
  PAYMENT_SECRET: z.string().default('dev-mock-payment-secret'),

  // Only required when PAYMENT_PROVIDER=razorpay (validated at provider
  // construction time so `mock`-mode dev/tests never need these set).
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  BOOKING_HOLD_MINUTES: z.coerce.number().default(15),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(300),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(5),

  LOG_LEVEL: z.string().default('info'),

  // Ticket numbers look like `${TICKET_NUMBER_PREFIX}-2026-000123`.
  TICKET_NUMBER_PREFIX: z.string().trim().min(1).default('LF'),

  // Login page linked from checker credential emails. Defaults to `${ADMIN_URL}/login`.
  // Prod: https://admin.kilf.in/login, dev: https://admin.dev.kilf.in/login
  ADMIN_LOGIN_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),

  // Outgoing mail (SMTP). When SMTP_HOST is unset, emails are logged instead of sent.
  SMTP_HOST: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.preprocess((v) => v === 'true' || v === '1' || v === true, z.boolean()).default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('KILF <no-reply@kilf.in>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
