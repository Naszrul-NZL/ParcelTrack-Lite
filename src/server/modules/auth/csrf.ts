import 'server-only';
import { AppError } from '@/server/core/errors';
import { equalSecret, verifyOrigin } from '@/server/core/request';

export function verifyCsrf(request: Request, expectedToken: string, expectedOrigin: string) {
  verifyOrigin(request, expectedOrigin);
  const provided = request.headers.get('x-csrf-token') ?? '';
  if (!provided || provided.length > 128 || !expectedToken || !equalSecret(provided, expectedToken)) throw new AppError('CSRF_INVALID');
}
