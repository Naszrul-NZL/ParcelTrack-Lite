'use client';
import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import { ApiFailure,createApiClient,type SessionState } from '@/shared/api-client';
import { principalSchema } from '@/shared/schemas';
const Context=createContext<SessionState>({status:'loading',principal:null,csrfToken:null});
export const useSession=()=>useContext(Context);
export function SessionProvider({children,fetcher=fetch}:{children:ReactNode;fetcher?:typeof fetch}) {
 const [state,setState]=useState<SessionState>({status:'loading',principal:null,csrfToken:null});
 useEffect(()=>{
  let active=true;
  const client=createApiClient({fetcher,csrf:()=>null,clearIdentity:()=>{if(active)setState({status:'anonymous',principal:null,csrfToken:null});}});
  void (async()=>{
   try{const csrf=await client<{csrfToken:string}>('/auth/csrf');const principal=principalSchema.parse(await client('/auth/me'));if(active)setState({status:'authenticated',principal,csrfToken:csrf.csrfToken});}
   catch(error){if(active)setState({status:error instanceof ApiFailure&&error.status===401?'anonymous':'error',principal:null,csrfToken:null});}
  })();
  return()=>{active=false;};
 },[fetcher]);
 return <Context.Provider value={state}>{children}</Context.Provider>;
}
