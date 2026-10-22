import fs from 'node:fs';
import { z } from 'zod';
import { principalSchema,parcelSummarySchema,parcelDetailSchema,publicTrackingSchema } from '../src/shared/schemas';
const schemas=Object.fromEntries(Object.entries({Principal:principalSchema,ParcelSummary:parcelSummarySchema,ParcelDetail:parcelDetailSchema,PublicTracking:publicTrackingSchema}).map(([name,schema])=>[name,z.toJSONSchema(schema)]));
const output=JSON.stringify({openapi:'3.1.0',info:{title:'ParcelTrack Lite foundation',version:'0.1.0'},paths:{'/api/v1/health':{get:{description:'Phase 1 liveness only; domain endpoints arrive in later phases.',responses:{'200':{description:'Application is running.'}}}}},components:{schemas}},null,2)+'\n';
const dest='docs/api/openapi.json';
if(process.argv.includes('--write')){fs.mkdirSync('docs/api',{recursive:true});fs.writeFileSync(dest,output);console.log('Shared DTO/OpenAPI snapshot written.');}
else if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==output)throw new Error('API/schema snapshot drift; review the changes and run npm run contract:write.');
else console.log('Shared DTO/OpenAPI snapshot matches.');
