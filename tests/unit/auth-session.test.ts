import { describe, expect, it } from 'vitest';
import { AppError, errorResponse } from '@/server/core/errors';
import { recordAudit } from '@/server/modules/auth/audit';
import { RATE_RULES, RateLimiter, normalizeSource } from '@/server/modules/auth/rate-limit';
import { expiredCookie, newToken, readCookieToken, sessionCookie, tokenDigest } from '@/server/modules/auth/sessions';

const development = { APP_ENV: 'development', SESSION_COOKIE_NAME: 'ptl_session_dev' } as const;
const production = { APP_ENV: 'production', SESSION_COOKIE_NAME: '__Host-ptl_session' } as const;
const withCookie = (value: string) => new Request('http://localhost/', { headers: { cookie: value } });

describe('M1-PH2-T02 session tokens and cookies', () => {
  it('uses 32 random bytes and stores only a SHA-256 digest', () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(token);
    expect(tokenDigest(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenDigest(token)).not.toContain(token);
  });

  it('sets HttpOnly, SameSite=Lax, Path=/ and no Domain, with Secure only in production', () => {
    const token = newToken();
    const dev = sessionCookie(development, token, 600);
    expect(dev).toBe(`ptl_session_dev=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    const prod = sessionCookie(production, token, 28_800);
    expect(prod).toBe(`__Host-ptl_session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=28800`);
    for (const cookie of [dev, prod]) expect(cookie).not.toMatch(/Domain=/i);
  });

  it('expires the cookie with the same attributes', () => {
    expect(expiredCookie(development)).toContain('Max-Age=0');
    expect(expiredCookie(production)).toMatch(/^__Host-ptl_session=; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=0/);
  });

  it('accepts exactly one well-formed token and ignores duplicates or malformed values', () => {
    const token = newToken();
    expect(readCookieToken(withCookie(`theme=dark; ptl_session_dev=${token}`), 'ptl_session_dev')).toBe(token);
    expect(readCookieToken(withCookie(`ptl_session_dev=${token}; ptl_session_dev=${token}`), 'ptl_session_dev')).toBeNull();
    expect(readCookieToken(withCookie('ptl_session_dev=short'), 'ptl_session_dev')).toBeNull();
    expect(readCookieToken(new Request('http://localhost/'), 'ptl_session_dev')).toBeNull();
  });
});

describe('M1-PH2-T04 rate-limit keys', () => {
  it('keys IPv6 sources by /64 and unwraps IPv4-mapped addresses', () => {
    expect(normalizeSource('203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeSource('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeSource('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(normalizeSource('2001:db8:1:2::1'));
    expect(normalizeSource('2001:db8:1:2::1')).not.toBe(normalizeSource('2001:db8:1:3::1'));
    expect(normalizeSource('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64');
    expect(normalizeSource('not an address')).toBe('unknown');
  });

  it('derives keyed digests that never contain the raw identity and differ per key and type', () => {
    const limiter = new RateLimiter('k'.repeat(40));
    const digest = limiter.digest('login_fail_pair', 'seller.a', '203.0.113.9');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain('seller');
    expect(limiter.digest('login_fail_user', 'seller.a', '203.0.113.9')).not.toBe(digest);
    expect(new RateLimiter('j'.repeat(40)).digest('login_fail_pair', 'seller.a', '203.0.113.9')).not.toBe(digest);
    expect(limiter.digest('t', 'ab', 'c')).not.toBe(limiter.digest('t', 'a', 'bc'));
  });

  it('counts in fixed windows from the injectable clock and reports Retry-After to the window end', async () => {
    let now = new Date('2026-11-17T10:00:00Z');
    const counters = new Map<string, number>();
    const client = {
      async query(sql: string, values: unknown[]) {
        const key = (values as [string, string, number]).join('|');
        if (sql.startsWith('INSERT')) counters.set(key, (counters.get(key) ?? 0) + 1);
        return { rows: [{ counter: counters.get(key) ?? 0 }] };
      },
    };
    const limiter = new RateLimiter('k'.repeat(40), () => now);
    for (let i = 1; i <= 5; i++) expect((await limiter.increment(client as never, RATE_RULES.loginPair, 'u', 's')).count).toBe(i);
    now = new Date('2026-11-17T10:14:59Z');
    expect((await limiter.count(client as never, RATE_RULES.loginPair, 'u', 's')).retryAfter).toBe(1);
    now = new Date('2026-11-17T10:15:00Z');
    expect((await limiter.count(client as never, RATE_RULES.loginPair, 'u', 's')).count).toBe(0);
  });
});

describe('M1-PH2-T07 audit allowlist', () => {
  const client = { calls: [] as unknown[][], async query(_sql: string, values: unknown[]) { this.calls.push(values); return { rows: [] }; } };
  const base = { type: 'LOGIN_FAILED', outcome: 'FAILURE', requestId: crypto.randomUUID() } as const;

  it('rejects unknown event types, detail keys and non-primitive values without writing', async () => {
    await expect(recordAudit(client as never, { ...base, type: 'PARCEL_ASSIGNED' as never })).rejects.toThrow('Unsupported audit event');
    await expect(recordAudit(client as never, { ...base, details: { password: 'CANARY' } as never })).rejects.toThrow('Unsupported audit detail');
    await expect(recordAudit(client as never, { ...base, details: { reason: { nested: 1 } as never } })).rejects.toThrow('Unsupported audit detail value');
    await expect(recordAudit(client as never, { ...base, details: { reason: 'x'.repeat(129) } })).rejects.toThrow('Unsupported audit detail value');
    expect(client.calls).toHaveLength(0);
  });

  it('writes allowlisted details only', async () => {
    await recordAudit(client as never, { ...base, targetUserId: '7', details: { reason: 'bad_password', usernameLength: 8 } });
    expect(client.calls[0]).toEqual([null, '7', 'LOGIN_FAILED', 'FAILURE', base.requestId, '{"reason":"bad_password","usernameLength":8}']);
  });
});

describe('RATE_LIMITED responses', () => {
  it('send Retry-After in whole seconds, never below one', async () => {
    const response = errorResponse(new AppError('RATE_LIMITED', undefined, 0.2));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('1');
    expect(errorResponse(new AppError('RATE_LIMITED', undefined, 61.4)).headers.get('retry-after')).toBe('62');
    expect(errorResponse(new AppError('AUTH_INVALID')).headers.get('retry-after')).toBeNull();
  });
});
