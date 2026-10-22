import fs from 'node:fs/promises';
import { fileFixtures } from '../tests/fixtures/files/generate';
const dir='.local/fixtures/files';await fs.mkdir(dir,{recursive:true,mode:0o700});
const manifest=[];
for(const fixture of await fileFixtures()){
 const file=fixture.id+'.bin';await fs.writeFile(dir+'/'+file,fixture.bytes,{mode:0o600});
 manifest.push({id:fixture.id,file,filename:fixture.filename,bytes:fixture.bytes.length,expected:fixture.expected});
}
await fs.writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
console.log('17 harmless file fixtures generated outside the served application.');
