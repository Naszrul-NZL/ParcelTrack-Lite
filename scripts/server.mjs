import next from 'next';
import http from 'node:http';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
const dev=process.argv.includes('--dev');
const profile=process.env.PTL_PROFILE==='test'?'test':'development';
const envFile=profile==='test'?'.env.test.local':'.env.local';
if(fs.existsSync(envFile))Object.assign(process.env,parseEnv(fs.readFileSync(envFile,'utf8')));
if(Object.keys(process.env).some(k=>/^(BOOTSTRAP_DATABASE_URL|MIGRATION_DATABASE_URL|BACKUP_DATABASE_URL|DB_PASSWORD_)/.test(k)))throw new Error('Private operator credentials must not enter the web process.');
const token=randomBytes(32).toString('hex');process.env.PTL_ADAPTER_SECRET=token;
const port=Number(process.env.PORT ?? (profile==='test'?3100:3000));
const allowedHosts=new Set([new URL(process.env.APP_ORIGIN).host,'127.0.0.1:'+port]);
const app=next({dev,hostname:'127.0.0.1',port});
await app.prepare();
const handler=app.getRequestHandler();
const server=http.createServer((req,res)=>{
  if(!allowedHosts.has(req.headers.host ?? '')){res.writeHead(400,{'Cache-Control':'no-store'});res.end('Invalid host');return;}
  req.headers['x-ptl-client-ip']=req.socket.remoteAddress ?? 'unknown';
  req.headers['x-ptl-adapter-token']=token;
  delete req.headers['x-forwarded-for'];delete req.headers['x-real-ip'];delete req.headers['x-forwarded-host'];delete req.headers['x-forwarded-proto'];
  handler(req,res);
});
server.headersTimeout=15_000;server.requestTimeout=60_000;
server.listen(port,'127.0.0.1',()=>console.log('ParcelTrack Lite: http://localhost:'+port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
