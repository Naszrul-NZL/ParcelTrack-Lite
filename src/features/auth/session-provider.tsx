'use client';
import { createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import { ApiFailure,createApiClient,type SessionState } from '@/shared/api-client';
import { csrfResponseSchema,loginResponseSchema,principalSchema,type Principal } from '@/shared/schemas';

export type SignInResult =
  | { ok: true; principal: Principal }
  | { ok: false; reason: 'invalid' | 'rate_limited' | 'expired' | 'busy' | 'invalid_input' | 'unavailable'; retryAfter?: number };
type Session = SessionState & { request<T>(path: string, init?: RequestInit): Promise<T>; identityKey: string; signIn(credentials: { username: string; password: string }): Promise<SignInResult>; signOut(): Promise<boolean>; expire(): void };

const anonymous: SessionState = { status: 'anonymous', principal: null, csrfToken: null };
const Context = createContext<Session>({ ...{ status: 'loading', principal: null, csrfToken: null } as SessionState, identityKey: 'loading', request: async () => { throw new Error('Session is unavailable.'); }, signIn: async () => ({ ok: false, reason: 'unavailable' }), signOut: async () => false, expire: () => undefined });
export const useSession = () => useContext(Context);

export function SessionProvider({ children, fetcher = fetch }: { children: ReactNode; fetcher?: typeof fetch }) {
  const [state, setState] = useState<SessionState>({ status: 'loading', principal: null, csrfToken: null });
  // The CSRF token lives in memory only: never in storage, a cookie or a URL.
  const csrf = useRef<string | null>(null);
  // Bumped by sign-in/out so a slower earlier session check cannot overwrite a newer result.
  const epoch = useRef(0);
  // Built per call so the client reads the in-memory token at request time, not during render.
  const request = useCallback(<T,>(path: string, init?: RequestInit) => {
    const started = epoch.current;
    return createApiClient({
      fetcher, csrf: () => csrf.current,
      clearIdentity: () => {
        if (started !== epoch.current) return;
        csrf.current = null;
        // A 401 on a signed-in page means the server ended the session (idle or absolute timeout, a password change or
        // reset elsewhere, or the account was disabled). Keep that reason so the guard can say so on the sign-in page.
        setState(current => current.status === 'anonymous' ? current : current.status === 'authenticated' ? { ...anonymous, ended: 'expired' } : anonymous);
      },
    })<T>(path, init);
  }, [fetcher]);

  useEffect(() => {
    const check = async () => {
      const started = epoch.current;
      // Ask who is signed in first: a visitor with no session never creates one just by viewing a page.
      try {
        const principal = principalSchema.parse(await request('/auth/me'));
        if (started !== epoch.current) return;
        const token = csrfResponseSchema.parse(await request('/auth/csrf')).csrfToken;
        if (started !== epoch.current) return;
        // Another tab can replace or revoke the cookie without advancing this provider's epoch.
        const confirmed = principalSchema.parse(await request('/auth/me'));
        if (started !== epoch.current) return;
        if (confirmed.id !== principal.id) throw new Error('Session identity changed during initialization.');
        csrf.current = token;
        setState({ status: 'authenticated', principal: confirmed, csrfToken: token });
      } catch (error) {
        if (started !== epoch.current) return;
        csrf.current = null;
        setState(error instanceof ApiFailure && error.status === 401 ? anonymous : { status: 'error', principal: null, csrfToken: null });
      }
    };
    void check();
    // A page restored from the back/forward cache may show private content from before sign-out; ask again.
    const restored = (event: PageTransitionEvent) => { if (event.persisted) void check(); };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, [request]);

  const signIn: Session['signIn'] = useCallback(async credentials => {
    const started = ++epoch.current;
    try {
      if (!csrf.current) {
        const token = csrfResponseSchema.parse(await request('/auth/csrf')).csrfToken;
        if (started !== epoch.current) return { ok: false, reason: 'unavailable' };
        csrf.current = token;
      }
      const { csrfToken, ...principal } = loginResponseSchema.parse(await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) }));
      if (started !== epoch.current) return { ok: false, reason: 'unavailable' };
      csrf.current = csrfToken;
      setState({ status: 'authenticated', principal, csrfToken });
      return { ok: true, principal };
    } catch (error) {
      if (started !== epoch.current) return { ok: false, reason: 'unavailable' };
      if (!(error instanceof ApiFailure)) return { ok: false, reason: 'unavailable' };
      if (error.status === 401) return { ok: false, reason: 'invalid' };
      if (error.status === 429) return { ok: false, reason: 'rate_limited', retryAfter: error.retryAfter };
      if (error.code === 'CSRF_INVALID') { csrf.current = null; return { ok: false, reason: 'expired' }; }
      if (error.status === 503) return { ok: false, reason: 'busy' };
      if (error.status === 422) return { ok: false, reason: 'invalid_input' };
      return { ok: false, reason: 'unavailable' };
    }
  }, [request]);

  const signOut: Session['signOut'] = useCallback(async () => {
    const started = ++epoch.current;
    try {
      if (!csrf.current) {
        const token = csrfResponseSchema.parse(await request('/auth/csrf')).csrfToken;
        if (started !== epoch.current) return false;
        csrf.current = token;
        setState(current => ({ ...current, csrfToken: token }));
      }
      await request('/auth/logout', { method: 'POST' });
    }
    // A 401 means the session was already gone, which is what sign-out wanted. Anything else leaves it active.
    catch (error) {
      if (started !== epoch.current) return false;
      if (error instanceof ApiFailure && error.code === 'CSRF_INVALID') {
        // Discard the stale token; only the user's next attempt fetches a new one and sends logout again.
        csrf.current = null;
        setState(current => ({ ...current, csrfToken: null }));
      }
      if (!(error instanceof ApiFailure && error.status === 401)) return false;
    }
    if (started !== epoch.current) return false;
    csrf.current = null;
    setState(anonymous);
    return true;
  }, [request]);

  // The server has already ended this session (a password change ends them all): forget the identity without a call.
  const expire: Session['expire'] = useCallback(() => {
    epoch.current++;
    csrf.current = null;
    setState(anonymous);
  }, []);

  const value = useMemo<Session>(() => ({ ...state, identityKey: state.principal?.id ?? state.status, request, signIn, signOut, expire }), [state, request, signIn, signOut, expire]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
