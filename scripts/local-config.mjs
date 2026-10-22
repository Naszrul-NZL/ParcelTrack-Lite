import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import { parse, stringify } from 'yaml';
const root=process.cwd();
const test=process.env.PTL_PROFILE==='test';
const profile=test?'test':'development';
const dir=path.join(root,'.local',profile);
await fs.mkdir(dir,{recursive:true});
const secret=(n=32)=>randomBytes(n).toString('hex');
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
let state;
try {state=JSON.parse(await fs.readFile(path.join(dir,'credentials.json'),'utf8'));}
catch(error) {
  if(error.code!=='ENOENT')throw error;
  state={postgres:secret(),jwt:secret(),dashboard:secret(),fingerprint:secret(),rateLimit:secret(),fixture:secret(),roles:{}};
  for(const role of ['migration_owner','app_runtime','tracking_runtime','maintenance_runtime','ops_runtime','backup_operator','fixture_provisioner'])state.roles[role]=secret();
  await fs.writeFile(path.join(dir,'credentials.json'),JSON.stringify(state),{mode:0o600,flag:'wx'});
}
const jwt=role=>{
  const body=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+10*365*86400});
  return body+'.'+createHmac('sha256',state.jwt).update(body).digest('base64url');
};
// Preserve generated signing tokens and encryption keys across ordinary startup.
if(!state.anon){state.anon=jwt('anon');state.service=jwt('service_role');state.keys={SECRET_KEY_BASE:secret(48),REALTIME_DB_ENC_KEY:secret(8),VAULT_ENC_KEY:secret(16),PG_META_CRYPTO_KEY:secret(),LOGFLARE_PUBLIC_ACCESS_TOKEN:secret(),LOGFLARE_PRIVATE_ACCESS_TOKEN:secret(),S3_PROTOCOL_ACCESS_KEY_ID:secret(16),S3_PROTOCOL_ACCESS_KEY_SECRET:secret(),SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+secret(24),SUPABASE_SECRET_KEY:'sb_secret_'+secret(24)};await fs.writeFile(path.join(dir,'credentials.json'),JSON.stringify(state),{mode:0o600});}
const template=await fs.readFile(path.join(root,'.local/upstream-env-template.txt'),'utf8');
const env=Object.fromEntries(template.split(/\r?\n/).filter(l=>/^[A-Z_0-9]+=/.test(l)).map(l=>{const n=l.indexOf('=');return[l.slice(0,n),l.slice(n+1)];}));
const gateway=test?8001:8000,port=test?54323:54322;
Object.assign(env,state.keys,{COMPOSE_FILE:'docker-compose.yml',POSTGRES_PASSWORD:state.postgres,JWT_SECRET:state.jwt,ANON_KEY:state.anon,SERVICE_ROLE_KEY:state.service,DASHBOARD_USERNAME:'local-admin',DASHBOARD_PASSWORD:state.dashboard,SUPABASE_PUBLIC_URL:'http://127.0.0.1:'+gateway,API_EXTERNAL_URL:'http://127.0.0.1:'+gateway+'/auth/v1',SITE_URL:'http://localhost:'+(test?3100:3000),ADDITIONAL_REDIRECT_URLS:'',POSTGRES_HOST:'db',POSTGRES_DB:'postgres',POSTGRES_PORT:'5432',POOLER_PROXY_PORT_TRANSACTION:'6543',PGRST_DB_SCHEMAS:'public,storage,graphql_public',DISABLE_SIGNUP:'true',OPENAI_API_KEY:'',SMTP_PASS:'',SMTP_USER:'',MINIO_ROOT_PASSWORD:state.postgres});
await fs.writeFile(path.join(dir,'supabase.env'),Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
const database=(user,password)=>'postgresql://'+user+':'+encodeURIComponent(password)+'@127.0.0.1:'+port+'/postgres';
const web={APP_ENV:profile==='development'?'development':'test',APP_ORIGIN:'http://localhost:'+(test?3100:3000),APP_DATABASE_URL:database('app_runtime',state.roles.app_runtime),TRACKING_DATABASE_URL:database('tracking_runtime',state.roles.tracking_runtime),SUPABASE_INTERNAL_URL:'http://127.0.0.1:'+gateway,STORAGE_SERVICE_KEY:state.service,FINGERPRINT_KEY:state.fingerprint,RATE_LIMIT_KEY:state.rateLimit,SESSION_COOKIE_NAME:'ptl_session_dev',PROOF_BUCKET:'delivery-proofs'};
// Web configuration intentionally contains no bootstrap/migration/operator credentials.
await fs.writeFile(path.join(root,test?'.env.test.local':'.env.local'),Object.entries(web).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
const ops={BOOTSTRAP_DATABASE_URL:database('postgres',state.postgres),MIGRATION_DATABASE_URL:database('migration_owner',state.roles.migration_owner),FIXTURE_DATABASE_URL:database('fixture_provisioner',state.roles.fixture_provisioner),BACKUP_DATABASE_URL:database('backup_operator',state.roles.backup_operator),FIXTURE_PASSWORD:state.fixture,ALLOW_SYNTHETIC_FIXTURES:'local-only',...Object.fromEntries(Object.entries(state.roles).map(([k,v])=>['DB_PASSWORD_'+k.toUpperCase(),v]))};
await fs.writeFile(path.join(dir,'operator.env'),Object.entries(ops).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
const compose=parse(await fs.readFile(path.join(root,'infra/supabase/vendor/docker-compose.yml'),'utf8'));
delete compose.name;
for(const [name,service] of Object.entries(compose.services)) {
  const original=service.container_name;
  delete service.container_name;
  if(original && name==='realtime')service.networks={default:{aliases:[original]}};
  if(service.ports)delete service.ports;
  service.logging={driver:'json-file',options:{'max-size':'10m','max-file':'3'}};
}
compose.services['api-gw'].ports=['127.0.0.1:'+gateway+':8000'];
compose.services.db.ports=['127.0.0.1:'+port+':5432'];
compose.services.supavisor.ports=test?['127.0.0.1:54331:5432','127.0.0.1:54332:6543']:['127.0.0.1:54329:5432','127.0.0.1:54330:6543'];
compose.services.supavisor.ulimits={...compose.services.supavisor.ulimits,nofile:{soft:100000,hard:100000}};
compose.services.db.volumes=compose.services.db.volumes.map(v=>v.startsWith('./volumes/db/data:')?'app-postgres-data:/var/lib/postgresql/data':v);
compose.services.storage.volumes=compose.services.storage.volumes.map(v=>v.startsWith('./volumes/storage:')?'app-storage-data:/var/lib/storage':v);
compose.services.storage.environment.FILE_SIZE_LIMIT=3*1024*1024;
compose.services.db.command.push('-c',"log_statement=none",'-c','log_parameter_max_length=0','-c','log_parameter_max_length_on_error=0');
compose.volumes['app-postgres-data']={};compose.volumes['app-storage-data']={};
await fs.writeFile(path.join(dir,'compose.yml'),stringify(compose));
console.log('Private local configuration prepared. Existing credentials preserved. Full upstream services retained; host ports bound to loopback.');
