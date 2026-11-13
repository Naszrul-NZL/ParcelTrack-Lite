import 'server-only';
import { randomUUID } from 'node:crypto';
import { errorResponse } from './errors';

export function apiHandler<Args extends unknown[]>(work: (request: Request, context: { requestId: string }, ...args: Args) => Promise<Response> | Response) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const response = await work(request, { requestId }, ...args);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Request-Id', requestId);
      return response;
    } catch (error) { return errorResponse(error, requestId); }
  };
}
