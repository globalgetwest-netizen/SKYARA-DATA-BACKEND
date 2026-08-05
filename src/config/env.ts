import dotenv from 'dotenv';

dotenv.config();

function str(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}
function num(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) ? n : fallback;
}
function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v == null) return fallback;
  return v === 'true' || v === '1';
}

const nodeEnv = str('NODE_ENV', 'development');

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: num('PORT', 4000),
  corsOrigins: str('CORS_ORIGINS', '*'),

  jwtSecret: str('JWT_SECRET', 'dev-insecure-secret-change-me'),

  // Admin dashboard credentials (seeded on startup). Change these before deploy.
  adminEmail: str('ADMIN_EMAIL', 'admin@skyradata.local'),
  adminPassword: str('ADMIN_PASSWORD', 'admin1234'),
  // Directory where JSON-persisted data (catalogue, settings) is stored.
  dataDir: str('DATA_DIR', 'data'),
  // Postgres connection string (Neon/Supabase/Render). When set, all persisted
  // data lives in the database (survives restarts on ephemeral hosts). When
  // blank, the backend falls back to local JSON files in DATA_DIR.
  databaseUrl: str('DATABASE_URL') || '',

  // Optional shared secret for central SSO (e.g. a SkyGlobe admin hub). When
  // set, admin tokens signed with this secret are also accepted, so one central
  // login can manage Skyra without a separate password here. Leave blank to use
  // only the local ADMIN_EMAIL/ADMIN_PASSWORD login.
  adminSsoSecret: str('ADMIN_SSO_SECRET') || '',
  jwtExpiresInDays: num('JWT_EXPIRES_IN_DAYS', 7),
  otpTtlSeconds: num('OTP_TTL_SECONDS', 300),
  otpMaxAttempts: num('OTP_MAX_ATTEMPTS', 5),
  otpDevMode: bool('OTP_DEV_MODE', true),

  paymentProvider: str('PAYMENT_PROVIDER', 'mock'),
  telecomProvider: str('TELECOM_PROVIDER', 'mock'),

  paystackSecretKey: str('PAYSTACK_SECRET_KEY'),
  paystackWebhookSecret: str('PAYSTACK_WEBHOOK_SECRET') || str('PAYSTACK_SECRET_KEY'),
  paystackCallbackUrl: str('PAYSTACK_CALLBACK_URL'),

  flutterwaveSecretKey: str('FLUTTERWAVE_SECRET_KEY'),
  flutterwaveWebhookHash: str('FLUTTERWAVE_WEBHOOK_HASH'),

  telecomApiBaseUrl: str('TELECOM_API_BASE_URL'),
  telecomApiKey: str('TELECOM_API_KEY'),

  processingFeeGhs: num('PROCESSING_FEE_GHS', 0.5),

  // USSD short code surfaced to the app's "buy on a basic phone" screen.
  ussdShortCode: str('USSD_SHORT_CODE', '*789#'),

  // Optional URLs to APPROVED official network logo assets, served to the app.
  // Leave blank to fall back to the neutral lettermark. Use only assets you are
  // licensed to display.
  logoUrls: {
    MTN: str('LOGO_MTN_URL') || null,
    TELECEL: str('LOGO_TELECEL_URL') || null,
    AT: str('LOGO_AT_URL') || null,
  } as Record<string, string | null>,

  mockStageMs: num('MOCK_STAGE_MS', 1500),
  mockFailureRate: num('MOCK_FAILURE_RATE', 0.12),
} as const;

/** Fail fast on obviously-unsafe production configuration. */
export function assertProductionConfig(): void {
  if (!env.isProduction) return;
  const problems: string[] = [];
  if (env.jwtSecret.length < 24) problems.push('JWT_SECRET is too short.');
  if (env.otpDevMode) problems.push('OTP_DEV_MODE must be false in production.');
  if (env.paymentProvider === 'mock') problems.push('PAYMENT_PROVIDER must not be "mock" in production.');
  if (env.telecomProvider === 'mock') problems.push('TELECOM_PROVIDER must not be "mock" in production.');
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error('[Skyra] Unsafe production configuration:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
}
