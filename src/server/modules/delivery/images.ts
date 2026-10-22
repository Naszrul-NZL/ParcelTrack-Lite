import 'server-only';
import sharp from 'sharp';
import { LIMITS } from '@/shared/constants';
import { AppError } from '@/server/core/errors';
sharp.concurrency(1);
sharp.cache({memory:16,files:0,items:20});
let active=0;
export function validateProofFilename(filename:string) {
  if(filename.length>200 || Array.from(filename).some(c=>c.charCodeAt(0)<32) || !/^[^./\\]+\.(jpg|jpeg|png)$/i.test(filename))throw new AppError('PROOF_INVALID');
}
function hasPngAnimation(bytes:Uint8Array) {
 const b=Buffer.from(bytes);
 if(b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return false;
 for(let offset=8;offset+12<=b.length;){
  const size=b.readUInt32BE(offset);if(size>b.length-offset-12)break;
  if(b.toString('ascii',offset+4,offset+8)==='acTL')return true;
  offset+=size+12;
 }
 return false;
}
export async function sanitizeImage(bytes: Uint8Array): Promise<{bytes:Buffer;mediaType:'image/jpeg'|'image/png';extension:'jpg'|'png'}> {
  if (bytes.byteLength > LIMITS.proofBytes) throw new AppError('PROOF_TOO_LARGE');
  if (!bytes.byteLength) throw new AppError('PROOF_INVALID');
  if(hasPngAnimation(bytes))throw new AppError('PROOF_INVALID');
  if(active>=2)throw new AppError('BUSY');
  active++;
  try {
    const image=sharp(bytes,{limitInputPixels:LIMITS.imagePixels,animated:true,failOn:'warning'});
    const meta=await image.metadata();
    if (!['jpeg','png'].includes(meta.format ?? '') || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width*meta.height>LIMITS.imagePixels) throw new AppError('PROOF_INVALID');
    const png=meta.format === 'png';
    const clean=await (png ? image.png() : image.jpeg({quality:85})).toBuffer();
    if (clean.length>LIMITS.proofBytes) throw new AppError('PROOF_TOO_LARGE');
    return {bytes:clean,mediaType:png?'image/png':'image/jpeg',extension:png?'png':'jpg'};
  } catch (error) { throw error instanceof AppError ? error : new AppError('PROOF_INVALID'); }
  finally{active--;}
}
