import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const privateValues=[];
function collect(value){if(typeof value==='string'&&value.length>=20)privateValues.push(value);else if(value&&typeof value==='object')for(const child of Object.values(value))collect(child);}
for(const profile of ['development','test']){
 try{collect(JSON.parse(await fs.readFile('.local/'+profile+'/credentials.json','utf8')));}catch(error){if(error.code!=='ENOENT')throw error;}
}
if(!privateValues.length)throw new Error('Generate private local configuration before checking for local credential leaks.');
const files=execFileSync('git',['ls-files','-c','-o','--exclude-standard','-z'],{encoding:'utf8',maxBuffer:10*1024*1024}).split('\0').filter(Boolean);
async function walk(directory){const found=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())found.push(...await walk(file));else if(entry.isFile())found.push(file);}return found;}
if(process.argv.includes('--built'))files.push(...await walk('.next/static'));
let bad=false;
for(const file of new Set(files)){
 let bytes;try{bytes=await fs.readFile(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
 if(privateValues.some(value=>bytes.includes(Buffer.from(value)))){console.error('Private local credential found in '+file);bad=true;}
}
if(bad)process.exitCode=1;
else console.log('Generated local credentials absent from Git-visible files'+(process.argv.includes('--built')?' and browser assets.':'.'));
// This exact-value local check supplements, rather than replaces, the planned history-aware scanner.
