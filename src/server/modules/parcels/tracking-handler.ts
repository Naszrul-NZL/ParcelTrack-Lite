import 'server-only';
import { assertConnectedRole, getPool, transaction, type TransactionPool } from '@/server/core/db';
import { AppError } from '@/server/core/errors';
import { apiHandler } from '@/server/core/handler';
import { readJsonBody } from '@/server/core/json-body';
import { sourceAddress, verifyOrigin } from '@/server/core/request';
import { getSettings, type Settings } from '@/server/core/settings';
import { RateLimiter, normalizeSource, type Clock, type RateRule } from '@/server/modules/auth/rate-limit';
import { trackingInputSchema } from '@/shared/schemas';
import { lookupTracking } from './tracking';

/** Contract default (D-18): 30 lookups per source per minute, invalid tokens included. */
export const TRACKING_RULE = { type: 'public_tracking', limit: 30, windowSeconds: 60 } as const satisfies RateRule;

export type TrackingHandlerDependencies = {
  /** `app_runtime`: only the limiter bucket is written here, never parcel data. */
  pool: TransactionPool;
  /** `tracking_runtime`: may only execute `app.lookup_tracking`. */
  trackingPool: TransactionPool;
  settings: Pick<Settings, 'APP_ORIGIN' | 'RATE_LIMIT_KEY'>;
  /** Trusted client address; defaults to the adapter-supplied socket address. */
  source?: (request: Request) => string;
  clock?: Clock;
};

/**
 * A13 `POST /public/tracking` (M2-PH3-T05). Read-only and public: no CSRF token and no anonymous session (D-09), but
 * the same-origin check applies. Order: same-origin check, limiter charge (so malformed bodies and invalid tokens count
 * too), bounded body, token normalization and format check (422), lookup through `tracking_runtime` (404 when unknown).
 * The response is exactly `{history:[{status,changedAt}]}` with `no-store`. The token is never logged, echoed or placed
 * in a URL; error bodies carry no field values.
 */
export function createTrackingHandler(dependencies: TrackingHandlerDependencies) {
  const { pool, trackingPool, settings } = dependencies;
  const limiter = new RateLimiter(settings.RATE_LIMIT_KEY, dependencies.clock);
  const sourceOf = (request: Request) => normalizeSource((dependencies.source ?? sourceAddress)(request));

  return apiHandler(async request => {
    verifyOrigin(request, settings.APP_ORIGIN);
    const charged = await transaction(pool, {}, async client => {
      await assertConnectedRole(client, 'app_runtime');
      return limiter.increment(client, TRACKING_RULE, sourceOf(request));
    });
    if (charged.count > TRACKING_RULE.limit) throw new AppError('RATE_LIMITED', undefined, charged.retryAfter);

    const parsed = trackingInputSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new AppError('VALIDATION_ERROR', { trackingNumber: 'Enter a tracking number in the form PTL- followed by 32 letters A-F or digits.' });
    const tracking = await lookupTracking(parsed.data.trackingNumber, trackingPool);
    if (!tracking) throw new AppError('NOT_FOUND');
    return Response.json(tracking);
  });
}

let production: ReturnType<typeof createTrackingHandler> | undefined;
/** Application wiring: the limiter uses `app_runtime`; the lookup uses the separate `tracking_runtime` pool. */
export function trackingHandler(request: Request) {
  production ??= createTrackingHandler({ pool: getPool('app_runtime'), trackingPool: getPool('tracking_runtime'), settings: getSettings() });
  return production(request);
}
