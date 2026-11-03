import 'dotenv/config'

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback
}

export const config = {
  port: Number(env('PORT', '3002')),
  isProd: env('NODE_ENV') === 'production',
  databaseUrl: env('DATABASE_URL'),
  // Public URL of the orientation client — used in SMS links and credential QR codes.
  appUrl: env('ORIENTATION_APP_URL', 'http://localhost:5175').replace(/\/$/, ''),
  clientOrigins: env('ORIENTATION_CLIENT_ORIGINS', 'http://localhost:5175')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Secret for worker session tokens and signed media URLs.
  tokenSecret: env('ORIENTATION_TOKEN_SECRET', 'dev-only-orientation-secret-change-me'),
  supabaseUrl: env('SUPABASE_URL', env('VITE_SUPABASE_URL')),
  supabaseAnonKey: env('SUPABASE_ANON_KEY', env('VITE_SUPABASE_ANON_KEY')),
  supabaseServiceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  // Legacy HS256 JWT secret — if set, staff tokens are verified locally (fast path).
  supabaseJwtSecret: env('SUPABASE_JWT_SECRET'),
  mediaBucket: env('ORIENTATION_MEDIA_BUCKET', 'orientation-media'),
  localMediaDir: env('ORIENTATION_LOCAL_MEDIA_DIR', '.data/media'),
  twilio: {
    accountSid: env('TWILIO_ACCOUNT_SID'),
    authToken: env('TWILIO_AUTH_TOKEN'),
    from: env('TWILIO_FROM'),
    messagingServiceSid: env('TWILIO_MESSAGING_SERVICE_SID'),
  },
  // Dev convenience: return OTP codes in the API response when no SMS provider is configured.
  exposeDevOtp: env('ORIENTATION_EXPOSE_DEV_OTP', env('NODE_ENV') === 'production' ? 'false' : 'true') === 'true',
  schedulerIntervalMs: Number(env('ORIENTATION_SCHEDULER_INTERVAL_MS', String(10 * 60 * 1000))),
}

if (config.isProd && config.tokenSecret.startsWith('dev-only')) {
  throw new Error('ORIENTATION_TOKEN_SECRET must be set in production')
}
