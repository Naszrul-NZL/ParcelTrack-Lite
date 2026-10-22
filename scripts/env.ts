import nextEnv from '@next/env';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
if(process.env.PTL_PROFILE==='test')Object.assign(process.env,{NODE_ENV:'test'});
nextEnv.loadEnvConfig(process.cwd(),process.env.NODE_ENV !== 'production');
const operatorFile=process.env.PTL_PROFILE==='test'?'.local/test/operator.env':'.local/development/operator.env';
if (fs.existsSync(operatorFile)) {
  // Private CLI configuration. This module is forbidden from the web import graph.
  for (const [key,value] of Object.entries(parseEnv(fs.readFileSync(operatorFile,'utf8')))) process.env[key] ??= value;
}
export function required(name:string) {
  const value=process.env[name];
  if(!value || value.startsWith('change-me'))throw new Error('Missing private configuration: '+name);
  return value;
}
