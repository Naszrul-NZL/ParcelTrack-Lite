import { describe, expect, it } from 'vitest';
import { sourceAddress } from '@/server/core/request';

const request = (headers: Record<string, string>) => new Request('https://parceltrack.example/api/v1/public/tracking', { method: 'POST', headers });
const code = (work: () => unknown) => { try { work(); return 'none'; } catch (error) { return (error as { code?: string }).code; } };

describe('client address for rate limits', () => {
  it('on Vercel, uses the address Vercel sets and ignores local adapter headers', () => {
    const vercel = { VERCEL: '1' };
    expect(sourceAddress(request({ 'x-vercel-forwarded-for': '203.0.113.9, 10.0.0.1' }), vercel)).toBe('203.0.113.9');
    expect(sourceAddress(request({ 'x-real-ip': '198.51.100.4' }), vercel)).toBe('198.51.100.4');
    // A client-chosen local adapter header has no effect on Vercel.
    expect(sourceAddress(request({ 'x-vercel-forwarded-for': '203.0.113.9', 'x-ptl-client-ip': '1.2.3.4' }), vercel)).toBe('203.0.113.9');
    expect(code(() => sourceAddress(request({}), vercel))).toBe('BUSY');
  });

  it('locally, requires the per-process adapter token, so clients cannot pick their own bucket', () => {
    const local = { PTL_ADAPTER_SECRET: 'a'.repeat(64) };
    expect(sourceAddress(request({ 'x-ptl-adapter-token': 'a'.repeat(64), 'x-ptl-client-ip': '127.0.0.1' }), local)).toBe('127.0.0.1');
    expect(code(() => sourceAddress(request({ 'x-ptl-client-ip': '127.0.0.1' }), local))).toBe('BUSY');
    expect(code(() => sourceAddress(request({ 'x-ptl-adapter-token': 'b'.repeat(64), 'x-ptl-client-ip': '127.0.0.1' }), local))).toBe('BUSY');
    // Vercel's headers are not trusted outside Vercel.
    expect(code(() => sourceAddress(request({ 'x-vercel-forwarded-for': '203.0.113.9' }), local))).toBe('BUSY');
    expect(code(() => sourceAddress(request({ 'x-ptl-adapter-token': 'a'.repeat(64), 'x-ptl-client-ip': '127.0.0.1' }), {}))).toBe('BUSY');
  });
});
