import fs from 'node:fs';
import { z } from 'zod';
import { principalSchema,loginSchema,loginResponseSchema,csrfResponseSchema,parcelInputSchema,parcelSummarySchema,parcelDetailSchema,publicTrackingSchema } from '../src/shared/schemas';
import { riderStatusMultipartSchema } from '../src/features/delivery/rider-contract';
import { assertPlanEndpointParity, assertProductionImportBoundary, implementedEndpoints } from './contract-inventory';
const schemas=Object.fromEntries(Object.entries({Principal:principalSchema,LoginRequest:loginSchema,LoginResponse:loginResponseSchema,CsrfResponse:csrfResponseSchema,ParcelSummary:parcelSummarySchema,ParcelDetail:parcelDetailSchema,PublicTracking:publicTrackingSchema}).map(([name,schema])=>[name,z.toJSONSchema(schema)]));
assertPlanEndpointParity();
assertProductionImportBoundary();
const paths:Record<string,Record<string,unknown>>={};
for(const endpoint of implementedEndpoints()) {
  paths[endpoint.path]??={};
  if (endpoint.id === 'A10') {
    paths[endpoint.path].post = {
      operationId: endpoint.id,
      description: 'Register a parcel as the signed-in Seller. During PH2, a repeated client request ID returns 409.',
      requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(parcelInputSchema, { io: 'input' }) } } },
      responses: {
        '201': { description: 'Registered parcel.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ParcelDetail' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A17') {
    paths[endpoint.path].post = {
      operationId: endpoint.id,
      description: 'Start delivery for an assigned Rider parcel.',
      parameters: [{ name: 'parcelId', in: 'path', required: true, schema: { type: 'string', pattern: '^[1-9][0-9]{0,17}$' } }],
      requestBody: { required: true, content: { 'multipart/form-data': { schema: z.toJSONSchema(riderStatusMultipartSchema) } } },
      responses: {
        '200': { description: 'Committed parcel status and detail.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ParcelDetail' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  paths[endpoint.path][endpoint.method.toLowerCase()]={operationId:endpoint.id,description:endpoint.id==='HEALTH'?'Application liveness.':'Implemented route; endpoint-specific request/response coverage remains required.',responses:endpoint.id==='HEALTH'?{'200':{description:'Application is running.'}}:{default:{description:'See the shared system contract and endpoint tests.'}}};
}
const output=JSON.stringify({openapi:'3.1.0',info:{title:'ParcelTrack Lite foundation',version:'0.1.0'},paths,components:{schemas}},null,2)+'\n';
const dest='docs/api/openapi.json';
if(process.argv.includes('--write')){fs.mkdirSync('docs/api',{recursive:true});fs.writeFileSync(dest,output);console.log('Shared DTO/OpenAPI snapshot written.');}
else if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==output)throw new Error('API/schema snapshot drift; review the changes and run npm run contract:write.');
else console.log('Shared DTO/OpenAPI snapshot matches.');
