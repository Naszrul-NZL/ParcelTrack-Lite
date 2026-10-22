import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const commands={up:['up','-d','--wait','--wait-timeout','240'],down:['down'],status:['ps'],pull:['pull']};
const action=process.argv[2];
if(!commands[action])throw new Error('Use up, down, status or pull. Volume deletion is intentionally not a normal command.');
const profile=process.env.PTL_PROFILE==='test'?'test':'development';
const args=['compose','--project-directory',path.resolve('infra/supabase/vendor'),'--env-file',path.resolve('.local/'+profile+'/supabase.env'),'-p','parceltrack-'+profile,'-f',path.resolve('.local/'+profile+'/compose.yml'),...commands[action]];
const result=spawnSync('docker',args,{stdio:'inherit',windowsHide:true});
if(action==='up' && result.status!==0){
  const credentials=JSON.parse(fs.readFileSync('.local/'+profile+'/credentials.json','utf8'));
  const values=[];
  function collect(value){
    if(typeof value==='string')values.push(value);
    else if(value && typeof value==='object')Object.values(value).forEach(collect);
  }
  collect(credentials);
  const diagnostic=spawnSync('docker',[...args.slice(0,-commands[action].length),'logs','--no-color','--tail','100','supavisor'],{encoding:'utf8',windowsHide:true});
  let output=(diagnostic.stdout??'')+(diagnostic.stderr??'');
  for(const value of values.sort((a,b)=>b.length-a.length))if(value)output=output.replaceAll(value,'[REDACTED]');
  console.error('Supavisor startup diagnostics (generated credentials redacted):\n'+output);
}
process.exit(result.status??1);
