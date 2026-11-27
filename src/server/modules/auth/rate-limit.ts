import 'server-only';
import { createHmac } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';
import type { PoolClient } from 'pg';

type Queryable = Pick<PoolClient, 'query'>;
export type RateRule = { type: string; limit: number; windowSeconds: number };
export type Clock = () => Date;

const FIFTEEN_MINUTES = 15 * 60;
// Defaults from the system contract (D-18). Failure counters block once `limit` failures are recorded;
// the anonymous-session counter is charged before work and denies the request after `limit`.
export const RATE_RULES = {
  loginPair: { type: 'login_fail_pair', limit: 5, windowSeconds: FIFTEEN_MINUTES },
  loginUser: { type: 'login_fail_user', limit: 20, windowSeconds: FIFTEEN_MINUTES },
  loginSource: { type: 'login_fail_source', limit: 100, windowSeconds: FIFTEEN_MINUTES },
  throttleAudit: { type: 'login_throttle_audit', limit: 1, windowSeconds: FIFTEEN_MINUTES },
  anonymousSession: { type: 'anonymous_session', limit: 60, windowSeconds: 60 },
  // The limit is configurable (REGISTRATION_LIMIT_PER_HOUR); this is the contract default (D-18).
  registration: { type: 'registration', limit: 30, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateRule>;

function expandIPv6(address: string): string[] | null {
  const [head, tail] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  if (address.includes('::') ? left.length + right.length > 7 : left.length !== 8) return null;
  const groups = address.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return groups.map(group => group.padStart(4, '0').toLowerCase());
}

/** Keys limiter buckets by client: IPv4 as is, IPv4-mapped IPv6 as IPv4, other IPv6 addresses by their /64. */
export function normalizeSource(address: string): string {
  const bare = address.split('%')[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(bare);
  if (mapped && isIPv4(mapped[1])) return mapped[1];
  if (isIPv4(bare)) return bare;
  if (isIPv6(bare)) {
    const groups = expandIPv6(bare);
    if (groups) return groups.slice(0, 4).join(':') + '::/64';
  }
  return 'unknown';
}

export class RateLimiter {
  constructor(private key: string, private clock: Clock = () => new Date()) {}

  /** Keyed digest of the bucket type and identity parts; raw usernames and addresses are never stored. */
  digest(type: string, ...parts: string[]) {
    return createHmac('sha256', this.key).update(JSON.stringify([type, ...parts])).digest('hex');
  }

  private window(rule: RateRule) {
    const seconds = this.clock().getTime() / 1000;
    const id = Math.floor(seconds / rule.windowSeconds);
    return { id, retryAfter: Math.max(1, Math.ceil((id + 1) * rule.windowSeconds - seconds)) };
  }

  /** Atomically records one event and returns the window count including it. */
  async increment(client: Queryable, rule: RateRule, ...parts: string[]) {
    const window = this.window(rule);
    const result = await client.query<{ counter: number }>(
      `INSERT INTO app.rate_limit_bucket(bucket_type,identity_digest,window_id,counter,expires_at)
       VALUES($1,$2,$3,1,to_timestamp(($3::bigint+1)*$4::bigint))
       ON CONFLICT (bucket_type,identity_digest,window_id) DO UPDATE SET counter=app.rate_limit_bucket.counter+1
       RETURNING counter`, [rule.type, this.digest(rule.type, ...parts), window.id, rule.windowSeconds]);
    return { count: result.rows[0].counter, retryAfter: window.retryAfter };
  }

  async count(client: Queryable, rule: RateRule, ...parts: string[]) {
    const window = this.window(rule);
    const result = await client.query<{ counter: number }>(
      'SELECT counter FROM app.rate_limit_bucket WHERE bucket_type=$1 AND identity_digest=$2 AND window_id=$3',
      [rule.type, this.digest(rule.type, ...parts), window.id]);
    return { count: result.rows[0]?.counter ?? 0, retryAfter: window.retryAfter };
  }
}
