import 'server-only';
import { LIMITS } from '@/shared/constants';
import { AppError } from './errors';

const BODY_DEADLINE_MS = 5000;

/**
 * Reads a bounded JSON request body. The declared length is checked first so an oversized body is never buffered, the
 * read stops at `LIMITS.jsonBytes`, and a slow client is cut off after five seconds so it cannot hold an open database
 * transaction until the idle timeout. Returns the parsed value; the caller validates it with its own strict schema.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMITS.jsonBytes)) {
    throw new AppError('VALIDATION_ERROR', { body: 'The request is too large.' });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '') || !request.body) {
    throw new AppError('VALIDATION_ERROR', { body: 'Send the request as JSON.' });
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const deadline = Promise.withResolvers<never>();
  const timer = setTimeout(() => deadline.reject(new AppError('BUSY')), BODY_DEADLINE_MS);
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), deadline.promise]);
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > LIMITS.jsonBytes) throw new AppError('VALIDATION_ERROR', { body: 'The request is too large.' });
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new AppError('VALIDATION_ERROR', { body: 'Send the request as JSON.' });
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
