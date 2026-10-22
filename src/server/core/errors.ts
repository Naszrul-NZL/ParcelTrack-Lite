import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
export const ERROR_STATUS = {
  VALIDATION_ERROR:422, UNAUTHENTICATED:401, AUTH_INVALID:401, FORBIDDEN:403, CSRF_INVALID:403,
  PASSWORD_CHANGE_REQUIRED:403, TARGET_NOT_ALLOWED:403, NOT_FOUND:404, USERNAME_TAKEN:409,
  VERSION_CONFLICT:409, INVALID_TRANSITION:409, IDEMPOTENCY_CONFLICT:409, REQUEST_EXPIRED:409,
  INVALID_ASSIGNEE:422, CURRENT_PASSWORD_INVALID:422, PROOF_REQUIRED:422, PROOF_COUNT:422,
  PROOF_NOT_ALLOWED:422, PROOF_TOO_LARGE:413, PROOF_INVALID:415, RATE_LIMITED:429,
  BUSY:503, MAINTENANCE:503, STORAGE_UNAVAILABLE:503, INTERNAL_ERROR:500,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;
export class AppError extends Error {
  constructor(public code: ErrorCode, public fieldErrors?: Record<string,string>) { super(code); }
}
const sqlStates: Record<string, ErrorCode> = {PT001:'FORBIDDEN',PT002:'NOT_FOUND',PT003:'VERSION_CONFLICT',PT004:'INVALID_TRANSITION',PT005:'INVALID_ASSIGNEE',PT006:'PROOF_REQUIRED',PT007:'TARGET_NOT_ALLOWED',PT008:'PASSWORD_CHANGE_REQUIRED',PT009:'IDEMPOTENCY_CONFLICT',PT010:'REQUEST_EXPIRED',PT011:'USERNAME_TAKEN',PT012:'UNAUTHENTICATED','55P03':'BUSY','40P01':'BUSY','57014':'BUSY'};
export function classifyError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof z.ZodError) return new AppError('VALIDATION_ERROR', Object.fromEntries(error.issues.map(i => [String(i.path[0] ?? 'input'), 'Enter a valid value.'])));
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return new AppError(sqlStates[code] ?? 'INTERNAL_ERROR');
}
export function errorResponse(error: unknown, requestId = randomUUID()): Response {
  const safe = classifyError(error);
  return Response.json({error:{code:safe.code, message: safe.code === 'INTERNAL_ERROR' ? 'Unable to complete the request.' : 'The request could not be completed.', ...(safe.fieldErrors ? {fieldErrors:safe.fieldErrors} : {})}, requestId}, {status:ERROR_STATUS[safe.code], headers:{'Cache-Control':'no-store','X-Request-Id':requestId,'X-Content-Type-Options':'nosniff'}});
}
