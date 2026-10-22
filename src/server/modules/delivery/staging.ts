import 'server-only';
import { mkdtemp,open,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIMITS } from '@/shared/constants';
import { AppError } from '@/server/core/errors';
// The future multipart reader must independently enforce the 4 MiB total-body cap.
export async function withStagedProof<T>(source:AsyncIterable<Uint8Array>,work:(path:string)=>Promise<T>):Promise<T> {
 const directory=await mkdtemp(join(tmpdir(),'ptl-proof-'));
 try{
  const path=join(directory,'input');const file=await open(path,'wx',0o600);let size=0;
  try{
   for await(const chunk of source){size+=chunk.byteLength;if(size>LIMITS.proofBytes)throw new AppError('PROOF_TOO_LARGE');await file.writeFile(chunk);}
   if(!size)throw new AppError('PROOF_INVALID');
  }finally{await file.close();}
  return await work(path);
 }finally{await rm(directory,{recursive:true,force:true});}
}
