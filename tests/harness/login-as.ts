import { apiHandler } from '@/server/core/handler';
import { PasswordService } from '@/server/modules/auth/password';
import { createAuthService } from '@/server/modules/auth/service';
import type { Clock } from '@/server/modules/auth/rate-limit';
import type { Role } from '@/shared/constants';
import type { Principal } from '@/shared/schemas';
import type { AccountName, IsolatedDatabase } from './isolated-database';

/** H20 test helper: signs in through the real A01/A03 handlers and the real session table (retires TMP-01 and TMP-04). */
export const DEFAULT_ACCOUNT: Record<Role, AccountName> = { ADMIN: 'admin', SELLER: 'seller.a', RIDER: 'rider.a' };

export type HandlerOptions = { source?: string; clock?: Clock; registrationLimit?: number };
export type LoginSession = {
  principal: Principal;
  /** Cookie jar value for the Cookie header. */
  cookie: string;
  csrfToken: string;
  /** Builds a same-origin request carrying this session; unsafe methods also carry its CSRF token. */
  request(path: string, init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }): Request;
};

export function origin() { return process.env.APP_ORIGIN!; }

export function authHandlers(database: IsolatedDatabase, options: HandlerOptions = {}) {
  const service = createAuthService({
    pool: database.pool(),
    settings: { APP_ENV: 'test', APP_ORIGIN: origin(), SESSION_COOKIE_NAME: 'ptl_session_dev', RATE_LIMIT_KEY: process.env.RATE_LIMIT_KEY! },
    passwords: new PasswordService(),
    source: () => options.source ?? '127.0.0.1',
    clock: options.clock,
    registrationLimit: options.registrationLimit,
  });
  return {
    csrf: apiHandler(request => service.csrf(request)),
    login: apiHandler((request, context) => service.login(request, context)),
    logout: apiHandler((request, context) => service.logout(request, context)),
    me: apiHandler(request => service.me(request)),
    register: apiHandler((request, context) => service.register(request, context)),
  };
}
export type AuthHandlers = ReturnType<typeof authHandlers>;

export function cookieFrom(response: Response) {
  const header = response.headers.getSetCookie().find(value => value.startsWith('ptl_session_dev='));
  return header ? header.split(';')[0] : null;
}

export function apiRequest(path: string, init: RequestInit & { cookie?: string; csrfToken?: string; headers?: Record<string, string> } = {}) {
  const { cookie, csrfToken, headers, ...rest } = init;
  const method = rest.method ?? 'GET';
  const unsafe = !['GET', 'HEAD'].includes(method);
  return new Request(origin() + '/api/v1' + path, {
    ...rest,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(unsafe ? { origin: origin(), ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) } : {}),
      ...(rest.body && !(rest.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
  });
}

export async function bootstrapCsrf(handlers: AuthHandlers, cookie?: string) {
  const response = await handlers.csrf(apiRequest('/auth/csrf', { cookie }));
  if (response.status !== 200) throw new Error('CSRF bootstrap failed with status ' + response.status);
  return { cookie: cookieFrom(response) ?? cookie!, csrfToken: (await response.json()).csrfToken as string, response };
}

export async function loginAs(database: IsolatedDatabase, who: Role | AccountName, options: HandlerOptions & { handlers?: AuthHandlers } = {}): Promise<LoginSession> {
  const handlers = options.handlers ?? authHandlers(database, options);
  const account = who in DEFAULT_ACCOUNT ? DEFAULT_ACCOUNT[who as Role] : who as AccountName;
  const anonymous = await bootstrapCsrf(handlers);
  const response = await handlers.login(apiRequest('/auth/login', {
    method: 'POST', cookie: anonymous.cookie, csrfToken: anonymous.csrfToken, body: JSON.stringify(database.loginInput(account)),
  }));
  if (response.status !== 200) throw new Error(`login_as(${account}) failed with status ${response.status}`);
  const { csrfToken, ...principal } = await response.json();
  const cookie = cookieFrom(response)!;
  return {
    principal, cookie, csrfToken,
    request: (path, init = {}) => apiRequest(path, { ...init, cookie, csrfToken }),
  };
}
