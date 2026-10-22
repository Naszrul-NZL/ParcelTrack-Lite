import { it,expect,vi } from 'vitest';
import { render,screen,waitFor } from '@testing-library/react';
import { SessionProvider,useSession } from '@/features/auth/session-provider';
import { createApiClient,ApiFailure } from '@/shared/api-client';
function Probe(){const session=useSession();return <p>{session.status}:{session.principal?.role}</p>;}
it('M1-PH1-TC09 loads the safe principal and falls back to anonymous on 401',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({csrfToken:'token'})).mockResolvedValueOnce(Response.json({error:{code:'UNAUTHENTICATED'}},{status:401}));
 render(<SessionProvider fetcher={fetcher}><Probe/></SessionProvider>);await waitFor(()=>expect(screen.getByText('anonymous:')).toBeInTheDocument());
});
it('M1-PH1-TC08 adds CSRF, clears identity on 401 and never retries a mutation',async()=>{
 const clear=vi.fn();const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{code:'UNAUTHENTICATED'}},{status:401}));
 const api=createApiClient({fetcher,csrf:()=> 'csrf',clearIdentity:clear});await expect(api('/auth/logout',{method:'POST'})).rejects.toBeInstanceOf(ApiFailure);expect(fetcher).toHaveBeenCalledOnce();expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-CSRF-Token')).toBe('csrf');expect(clear).toHaveBeenCalledOnce();
});
