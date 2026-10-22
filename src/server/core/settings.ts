import 'server-only';
import { z } from 'zod';
const secret = z.string().min(32).refine(v => !/^(change-me|example|replace)/i.test(v));
const shape = z.object({
  APP_ENV: z.enum(['development','test','production']),
  APP_ORIGIN: z.url(),
  APP_DATABASE_URL: z.string().startsWith('postgres'),
  TRACKING_DATABASE_URL: z.string().startsWith('postgres'),
  SUPABASE_INTERNAL_URL: z.url(), STORAGE_SERVICE_KEY: secret,
  FINGERPRINT_KEY: secret, RATE_LIMIT_KEY: secret,
  SESSION_COOKIE_NAME: z.string(),
  PROOF_BUCKET: z.string().default('delivery-proofs'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(4),
  HASH_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
});
export type Settings = z.infer<typeof shape>;
export function parseSettings(env: Record<string,string|undefined>): Settings {
  if (env.APP_ENV === 'production' && Object.keys(env).some(k => /^(FAILPOINT_|TEST_|ENABLE_TEST)/.test(k) && env[k])) throw new Error('Test-only configuration is forbidden in production.');
  const parsed = shape.safeParse(env);
  if (!parsed.success) throw new Error('Required application configuration is missing or invalid.');
  if (parsed.data.FINGERPRINT_KEY === parsed.data.RATE_LIMIT_KEY) throw new Error('Independent application keys are required.');
  if (parsed.data.APP_ENV === 'production' && (parsed.data.SESSION_COOKIE_NAME !== '__Host-ptl_session' || !parsed.data.APP_ORIGIN.startsWith('https://'))) throw new Error('Production requires HTTPS and the secure session cookie.');
  if (parsed.data.APP_ENV !== 'production' && parsed.data.SESSION_COOKIE_NAME !== 'ptl_session_dev') throw new Error('Use the local development session cookie.');
  return parsed.data;
}
export const getSettings = () => parseSettings(process.env);
