import type { Principal } from './schemas';
export class ApiFailure extends Error { constructor(public status:number,public code:string,public fields?:Record<string,string>){super(code);} }
export function createApiClient(options:{fetcher?:typeof fetch;csrf:()=>string|null;clearIdentity:()=>void}) {
  return async function request<T>(path:string,init:RequestInit={}):Promise<T> {
    const headers=new Headers(init.headers);
    if(!['GET','HEAD'].includes(init.method??'GET') && options.csrf())headers.set('X-CSRF-Token',options.csrf()!);
    const response=await (options.fetcher??fetch)('/api/v1'+path,{...init,headers,credentials:'same-origin',cache:'no-store'});
    if(response.status===401)options.clearIdentity();
    if(!response.ok){let body;try{body=await response.json();}catch{ /* Non-JSON failures use the safe generic code. */ }throw new ApiFailure(response.status,body?.error?.code??'INTERNAL_ERROR',body?.error?.fieldErrors);}
    return response.status===204?undefined as T:response.json();
  };
}
export type SessionState={status:'loading'|'anonymous'|'authenticated'|'error';principal:Principal|null;csrfToken:string|null};
