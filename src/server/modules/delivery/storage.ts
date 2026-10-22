import 'server-only';
import { randomBytes } from 'node:crypto';
import { AppError } from '@/server/core/errors';
import { LIMITS } from '@/shared/constants';
export const STORAGE_KEY = /^[1-9][0-9]{0,17}\/[0-9a-f]{32}\.(jpg|png)$/;
export interface ProofStore {
  publish(key:string,bytes:Uint8Array,mediaType:string):Promise<void>;
  open(key:string):Promise<Uint8Array>;
  delete(key:string):Promise<void>;
  exists(key:string):Promise<boolean>;
  listOld(parcelId:string,before:Date):AsyncIterable<{key:string;createdAt:Date}>;
}
export function makeStorageKey(parcelId:string,extension:'jpg'|'png') {
  const key=parcelId+'/'+randomBytes(16).toString('hex')+'.'+extension;
  if (!STORAGE_KEY.test(key)) throw new AppError('VALIDATION_ERROR');
  return key;
}
export class SupabaseProofStore implements ProofStore {
  constructor(private url:string,private credential:string,private bucket='delivery-proofs',private transport:typeof fetch=fetch) {}
  private path(key:string) { if (!STORAGE_KEY.test(key)) throw new AppError('VALIDATION_ERROR'); return this.url+'/storage/v1/object/'+encodeURIComponent(this.bucket)+'/'+key; }
  private async call(url:string,init:RequestInit={}) {
    try { return await this.transport(url,{...init,signal:AbortSignal.timeout(10_000),headers:{apikey:this.credential,Authorization:'Bearer '+this.credential,...init.headers}}); }
    catch { throw new AppError('STORAGE_UNAVAILABLE'); }
  }
  async publish(key:string,bytes:Uint8Array,mediaType:string) {
    const path=this.path(key);
    if (bytes.length>LIMITS.proofBytes) throw new AppError('PROOF_TOO_LARGE');
    const r=await this.call(path,{method:'POST',headers:{'Content-Type':mediaType,'x-upsert':'false'},body:Buffer.from(bytes)});
    if (!r.ok) throw new AppError('STORAGE_UNAVAILABLE');
  }
  async open(key:string) { const r=await this.call(this.path(key)); if (!r.ok) throw new AppError(r.status===404?'NOT_FOUND':'STORAGE_UNAVAILABLE'); const b=new Uint8Array(await r.arrayBuffer()); if(b.length>LIMITS.proofBytes)throw new AppError('PROOF_TOO_LARGE'); return b; }
  async delete(key:string) { this.path(key); const r=await this.call(this.url+'/storage/v1/object/'+encodeURIComponent(this.bucket),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[key]})}); if (!r.ok) throw new AppError('STORAGE_UNAVAILABLE'); }
  async exists(key:string) { const r=await this.call(this.path(key),{method:'HEAD'}); if(r.status===404)return false; if(!r.ok)throw new AppError('STORAGE_UNAVAILABLE'); return true; }
  async list(parcelId:string,offset=0):Promise<{name:string;created_at:string}[]> {
    if(!/^[1-9][0-9]{0,17}$/.test(parcelId))throw new AppError('VALIDATION_ERROR');
    const r=await this.call(this.url+'/storage/v1/object/list/'+encodeURIComponent(this.bucket),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:parcelId,limit:100,offset,sortBy:{column:'name',order:'asc'}})});
    if(!r.ok)throw new AppError('STORAGE_UNAVAILABLE'); return r.json();
  }
  async *listOld(parcelId:string,before:Date) {
    if(!Number.isFinite(before.getTime()))throw new AppError('VALIDATION_ERROR');
    for(let offset=0;offset<100_000;offset+=100){
      const entries=await this.list(parcelId,offset);
      for(const entry of entries){const key=parcelId+'/'+entry.name;const createdAt=new Date(entry.created_at);if(STORAGE_KEY.test(key)&&Number.isFinite(createdAt.getTime())&&createdAt<before)yield{key,createdAt};}
      if(entries.length<100)return;
    }
    throw new AppError('BUSY');
  }
}
