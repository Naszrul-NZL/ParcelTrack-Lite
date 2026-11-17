import { it,expect,vi } from 'vitest';
import { render,screen,waitFor } from '@testing-library/react';
import { SessionProvider,useSession } from '@/features/auth/session-provider';
import { createApiClient,ApiFailure } from '@/shared/api-client';
function Probe(){const session=useSession();return <p>{session.status}:{session.principal?.role}</p>;}
it('M1-PH1-TC09 loads the safe principal and falls back to anonymous on 401',async()=>{
 // A visitor with no session is only asked who they are: no anonymous session is created by viewing a page.
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({error:{code:'UNAUTHENTICATED'}},{status:401}));
 render(<SessionProvider fetcher={fetcher}><Probe/></SessionProvider>);await waitFor(()=>expect(screen.getByText('anonymous:')).toBeInTheDocument());
 expect(fetcher).toHaveBeenCalledOnce();expect(String(fetcher.mock.calls[0][0])).toBe('/api/v1/auth/me');
});
it('M1-PH2-T10 reconciles the principal after loading CSRF for an existing session',async()=>{
 const principal={id:'7',username:'rider.a',displayName:'rider.a',role:'RIDER',mustChangePassword:false};
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(principal)).mockResolvedValueOnce(Response.json({csrfToken:'csrf-token'})).mockResolvedValueOnce(Response.json(principal));
 render(<SessionProvider fetcher={fetcher}><Probe/></SessionProvider>);await waitFor(()=>expect(screen.getByText('authenticated:RIDER')).toBeInTheDocument());
 expect(fetcher.mock.calls.map(call=>String(call[0]))).toEqual(['/api/v1/auth/me','/api/v1/auth/csrf','/api/v1/auth/me']);
});
it('M1-PH1-TC08 adds CSRF, clears identity on 401 and never retries a mutation',async()=>{
 const clear=vi.fn();const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{code:'UNAUTHENTICATED'}},{status:401}));
 const api=createApiClient({fetcher,csrf:()=> 'csrf',clearIdentity:clear});await expect(api('/auth/logout',{method:'POST'})).rejects.toBeInstanceOf(ApiFailure);expect(fetcher).toHaveBeenCalledOnce();expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-CSRF-Token')).toBe('csrf');expect(clear).toHaveBeenCalledOnce();
});
