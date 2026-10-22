import { it,expect } from 'vitest';
import { access,readFile } from 'node:fs/promises';
import { withStagedProof } from '@/server/modules/delivery/staging';
import { LIMITS } from '@/shared/constants';
async function* chunks(...values:Uint8Array[]){yield*values;}
it('M3-PH1-TC04 staging removes private bytes after success and failure',async()=>{
 let staged='';await withStagedProof(chunks(Buffer.from('synthetic')),async path=>{staged=path;expect((await readFile(path)).toString()).toBe('synthetic');});await expect(access(staged)).rejects.toThrow();
 await expect(withStagedProof(chunks(Buffer.from('synthetic')),async path=>{staged=path;throw new Error('deliberate failure');})).rejects.toThrow('deliberate failure');await expect(access(staged)).rejects.toThrow();
});
it('M3-PH1-TC04 staging bounds the cumulative input',async()=>{await expect(withStagedProof(chunks(Buffer.alloc(LIMITS.proofBytes),Buffer.from([1])),async()=>true)).rejects.toMatchObject({code:'PROOF_TOO_LARGE'});});
