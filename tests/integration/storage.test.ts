import '../../scripts/env';
import { it,expect } from 'vitest';
import sharp from 'sharp';
import { SupabaseProofStore,makeStorageKey } from '@/server/modules/delivery/storage';
it('M3-PH1-TC04 private Storage API persists bytes and blocks anonymous access/overwrite',async()=>{
 const url=process.env.SUPABASE_INTERNAL_URL!;const store=new SupabaseProofStore(url,process.env.STORAGE_SERVICE_KEY!,process.env.PROOF_BUCKET);
 const key=makeStorageKey('999999','png');const bytes=await sharp({create:{width:16,height:16,channels:3,background:'#152e48'}}).png().toBuffer();
 try{await store.publish(key,bytes,'image/png');expect(Buffer.from(await store.open(key))).toEqual(bytes);await expect(store.publish(key,bytes,'image/png')).rejects.toThrow();const anonymous=await fetch(url+'/storage/v1/object/public/'+(process.env.PROOF_BUCKET??'delivery-proofs')+'/'+key);expect(anonymous.ok).toBe(false);}finally{await store.delete(key);}
});
