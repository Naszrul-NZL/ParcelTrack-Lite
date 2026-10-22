import { it,expect } from 'vitest';
import { fileFixtures } from '../fixtures/files/generate';
import { sanitizeImage,validateProofFilename } from '@/server/modules/delivery/images';
for(const fixture of await fileFixtures())it('M3-PH1-TC05 fixture '+fixture.id,async()=>{
 const work=async()=>{validateProofFilename(fixture.filename);return sanitizeImage(fixture.bytes);};
 if(fixture.expected==='clean')expect((await work()).bytes.includes(Buffer.from('synthetic-canary'))).toBe(false);
 else await expect(work()).rejects.toMatchObject({code:fixture.expected});
});
