import { it,expect } from 'vitest';
import sharp from 'sharp';
import { sanitizeImage } from '@/server/modules/delivery/images';
import { makeStorageKey,SupabaseProofStore } from '@/server/modules/delivery/storage';
import { LIMITS } from '@/shared/constants';
it('M3-PH1-TC05 strips EXIF and appended payloads',async()=>{
 const source=await sharp({create:{width:64,height:64,channels:3,background:'#152e48'}}).withMetadata({exif:{IFD0:{Artist:'CANARY'}}}).jpeg().toBuffer();
 const cleaned=await sanitizeImage(Buffer.concat([source,Buffer.from('<script>CANARY</script>')]));
 expect((await sharp(cleaned.bytes).metadata()).exif).toBeUndefined();expect(cleaned.bytes.includes(Buffer.from('CANARY'))).toBe(false);
});
it('M3-PH1-TC05 rejects unsupported/corrupt/over-limit images before storage',async()=>{
 await expect(sanitizeImage(Buffer.from('<svg><script/></svg>'))).rejects.toMatchObject({code:'PROOF_INVALID'});
 await expect(sanitizeImage(new Uint8Array(LIMITS.proofBytes+1))).rejects.toMatchObject({code:'PROOF_TOO_LARGE'});
 await expect(sanitizeImage(new Uint8Array())).rejects.toMatchObject({code:'PROOF_INVALID'});
});
it('M3-PH1-TC04 rejects traversal and refuses overwrites',async()=>{
 const requests:RequestInit[]=[];const store=new SupabaseProofStore('http://local','private','delivery-proofs',async(_url,init)=>{requests.push(init!);return new Response('',{status:409});});
 await expect(store.open('../private')).rejects.toMatchObject({code:'VALIDATION_ERROR'});
 await expect(store.publish(makeStorageKey('1','jpg'),new Uint8Array([1]),'image/jpeg')).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'});
 expect(new Headers(requests[0].headers).get('x-upsert')).toBe('false');
});
