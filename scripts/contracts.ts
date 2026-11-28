import fs from 'node:fs';
import { z } from 'zod';
import { principalSchema,userSummarySchema,userListSchema,userStatusSchema,registerSchema,changePasswordSchema,createRiderSchema,temporaryPasswordSchema,auditListSchema,loginSchema,loginResponseSchema,csrfResponseSchema,parcelInputSchema,parcelListSchema,parcelSummarySchema,parcelDetailSchema,publicTrackingSchema,trackingInputSchema,PARCEL_SORTS } from '../src/shared/schemas';
import { AUDIT_TYPES, STATUSES } from '../src/shared/constants';
import { riderListSchema,riderStatusMultipartSchema } from '../src/features/delivery/rider-contract';
import { adminParcelListSchema,assignmentSchema,dashboardSchema } from '../src/features/delivery/admin-contract';
import { assertPlanEndpointParity, assertProductionImportBoundary, implementedEndpoints } from './contract-inventory';
const schemas=Object.fromEntries(Object.entries({Principal:principalSchema,UserSummary:userSummarySchema,UserList:userListSchema,LoginRequest:loginSchema,LoginResponse:loginResponseSchema,CsrfResponse:csrfResponseSchema,ParcelList:parcelListSchema,ParcelSummary:parcelSummarySchema,ParcelDetail:parcelDetailSchema,PublicTracking:publicTrackingSchema,RiderList:riderListSchema,TemporaryPassword:temporaryPasswordSchema,AuditList:auditListSchema,AdminParcelList:adminParcelListSchema,Dashboard:dashboardSchema}).map(([name,schema])=>[name,z.toJSONSchema(schema)]));
assertPlanEndpointParity();
assertProductionImportBoundary();
const paths:Record<string,Record<string,unknown>>={};
for(const endpoint of implementedEndpoints()) {
  paths[endpoint.path]??={};
  if (endpoint.id === 'A10') {
    paths[endpoint.path].post = {
      operationId: endpoint.id,
      description: 'Register a parcel as the signed-in Seller. Repeating a client request ID with the same data returns the original parcel (200); different data returns 409 IDEMPOTENCY_CONFLICT, and a key whose parcel was anonymized returns 409 REQUEST_EXPIRED.',
      requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(parcelInputSchema, { io: 'input' }) } } },
      responses: {
        '201': { description: 'Registered parcel.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ParcelDetail' } } } },
        '200': { description: 'The parcel this client request ID already registered, with the same data.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ParcelDetail' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A11' || endpoint.id === 'A12') {
    const list = endpoint.id === 'A11';
    paths[endpoint.path].get = {
      operationId: endpoint.id,
      description: list ? 'List the signed-in Seller’s parcels.' : 'Read a parcel visible to the authenticated actor.',
      parameters: list ? [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 } },
        { name: 'pageSize', in: 'query', description: 'Values above 100 are capped at 100.', schema: { type: 'integer', minimum: 1, default: 20 } },
        { name: 'q', in: 'query', description: 'Literal search: a tracking-number prefix or a recipient-name substring, case-insensitive. Wildcard characters match themselves.', schema: { type: 'string', minLength: 1, maxLength: 64 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: [...STATUSES] } },
        { name: 'sort', in: 'query', description: 'Newest first; currentStatus orders by delivery stage, then newest first.', schema: { type: 'string', enum: [...PARCEL_SORTS], default: 'createdAt' } },
      ] : [{ name: 'parcelId', in: 'path', required: true, schema: { type: 'string', pattern: '^[1-9][0-9]{0,17}$' } }],
      responses: {
        '200': {
          description: list ? 'Page of Seller parcels.' : 'Private parcel detail.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/' + (list ? 'ParcelList' : 'ParcelDetail') } } },
        },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A13') {
    paths[endpoint.path].post = {
      operationId: endpoint.id,
      description: 'Public parcel tracking. No session or CSRF token is needed, but the request must be same-origin and is limited to 30 lookups per source per minute, invalid tokens included. The token is trimmed and uppercased before validation. The response holds only the status history; it never contains recipient, actor or proof data.',
      requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(trackingInputSchema, { io: 'input' }) } } },
      responses: {
        '200': { description: 'Public status history, oldest first.', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicTracking' } } } },
        '404': { description: 'No parcel has this tracking number.' },
        '422': { description: 'The tracking number is not in the PTL- format.' },
        '429': { description: 'Too many lookups from this source; see Retry-After.' },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A02') {
    paths[endpoint.path].post = {
      operationId: endpoint.id,
      description: 'Register a Seller account. The role is always Seller; the request cannot choose it. The new account is not signed in. Requires the CSRF token from A01 and is limited per source address.',
      requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(registerSchema, { io: 'input' }) } } },
      responses: {
        '201': { description: 'The new Seller account.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Principal' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A06') {
    paths[endpoint.path].post = {
      operationId: endpoint.id,
      description: 'Change the signed-in account’s own password. Also allowed while the account must change it. Wrong current-password attempts are limited per account. On success every session of the account, including this one, is ended and nobody is signed in again.',
      requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(changePasswordSchema, { io: 'input' }) } } },
      responses: {
        '204': { description: 'Password changed and all sessions ended. The session cookie is cleared.' },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A07') {
    paths[endpoint.path].get = {
      operationId: endpoint.id,
      description: 'List accounts for an Admin, newest first. The response carries only the non-secret account summary fields.',
      parameters: [
        { name: 'role', in: 'query', schema: { type: 'string', enum: ['SELLER', 'RIDER', 'ADMIN'] } },
        { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 } },
        { name: 'pageSize', in: 'query', description: 'Values above 100 are capped at 100.', schema: { type: 'integer', minimum: 1, default: 20 } },
      ],
      responses: {
        '200': { description: 'Page of account summaries.', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserList' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A20') {
    paths[endpoint.path].get = {
      operationId: endpoint.id,
      description: 'List audit events for an Admin, newest first. Each event carries only safe fields and allowlisted details; request bodies, passwords and tokens are never part of an audit record.',
      parameters: [
        { name: 'eventType', in: 'query', schema: { type: 'string', enum: [...AUDIT_TYPES] } },
        { name: 'parcelId', in: 'query', schema: { type: 'string', pattern: '^[1-9][0-9]{0,17}$' } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 } },
        { name: 'pageSize', in: 'query', description: 'Values above 100 are capped at 100.', schema: { type: 'integer', minimum: 1, default: 20 } },
      ],
      responses: {
        '200': { description: 'Page of audit events.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuditList' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A08') {
    paths[endpoint.path].post = {
      operationId: endpoint.id,
      description: 'Create a Rider account as an Admin. The role is fixed by this endpoint. The initial password must be changed at first sign-in, expires after 72 hours if unused, and is never returned.',
      requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(createRiderSchema, { io: 'input' }) } } },
      responses: {
        '201': { description: 'The new Rider account.', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserSummary' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A21') {
    paths[endpoint.path].post = {
      operationId: endpoint.id,
      description: 'Reset a Seller or Rider password as an Admin. A random one-time password is returned once and never stored in clear text or logged. The account must change it at next sign-in, it expires after 72 hours, and the account’s sessions end.',
      parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', pattern: '^[1-9][0-9]{0,17}$' } }],
      responses: {
        '200': { description: 'The one-time password, shown once.', content: { 'application/json': { schema: { $ref: '#/components/schemas/TemporaryPassword' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A09') {
    paths[endpoint.path].patch = {
      operationId: endpoint.id,
      description: 'Disable or reactivate a Seller or Rider as an Admin. Every change ends the account’s sessions; reactivation does not restore them.',
      parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', pattern: '^[1-9][0-9]{0,17}$' } }],
      requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(userStatusSchema, { io: 'input' }) } } },
      responses: {
        '200': { description: 'Updated account summary.', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserSummary' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A14') {
    paths[endpoint.path].get = {
      operationId: endpoint.id,
      description: 'List parcels for an Admin, including the assigned Rider summary and the inactive-Rider reassignment signal.',
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['REGISTERED','ASSIGNED','OUT_FOR_DELIVERY','DELIVERED','FAILED'] } },
        { name: 'riderId', in: 'query', schema: { type: 'string', pattern: '^[1-9][0-9]{0,17}$' } },
        { name: 'needsReassignment', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 } },
        { name: 'pageSize', in: 'query', description: 'Values above 100 are capped at 100.', schema: { type: 'integer', minimum: 1, default: 20 } },
      ],
      responses: {
        '200': { description: 'Page of parcel and assigned-Rider summaries.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminParcelList' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A15') {
    paths[endpoint.path].patch = {
      operationId: endpoint.id,
      description: 'Assign or reassign a non-terminal parcel to an active Rider as an Admin.',
      parameters: [{ name: 'parcelId', in: 'path', required: true, schema: { type: 'string', pattern: '^[1-9][0-9]{0,17}$' } }],
      requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(assignmentSchema, { io: 'input' }) } } },
      responses: {
        '200': { description: 'Committed parcel assignment and detail.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ParcelDetail' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A16') {
    paths[endpoint.path].get = {
      operationId: endpoint.id,
      description: 'List parcels assigned to the signed-in Rider.',
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['REGISTERED','ASSIGNED','OUT_FOR_DELIVERY','DELIVERED','FAILED'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 2_147_483_647, default: 1 } },
        { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ],
      responses: {
        '200': { description: 'Page of parcels assigned to the Rider.', content: { 'application/json': { schema: { $ref: '#/components/schemas/RiderList' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A17') {
    paths[endpoint.path].post = {
      operationId: endpoint.id,
      description: 'Start or finalize delivery for an assigned Rider parcel. Final outcomes require one sanitized JPEG or PNG proof.',
      parameters: [{ name: 'parcelId', in: 'path', required: true, schema: { type: 'string', pattern: '^[1-9][0-9]{0,17}$' } }],
      requestBody: { required: true, content: { 'multipart/form-data': { schema: {
        ...z.toJSONSchema(riderStatusMultipartSchema),
        properties: {
          ...z.toJSONSchema(riderStatusMultipartSchema).properties,
          proof: { type: 'string', format: 'binary', description: 'Required for DELIVERED or FAILED; forbidden for OUT_FOR_DELIVERY.' },
        },
      } } } },
      responses: {
        '200': { description: 'Committed parcel status and detail.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ParcelDetail' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A18') {
    paths[endpoint.path].get = {
      operationId: endpoint.id,
      description: 'Read one-snapshot parcel counts for all five statuses as an Admin.',
      responses: {
        '200': { description: 'Zero-filled status counts, coherent total and generation time.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Dashboard' } } } },
        default: { description: 'Safe error envelope. See the system contract.' },
      },
    };
    continue;
  }
  if (endpoint.id === 'A19') {
    paths[endpoint.path].get = {
      operationId: endpoint.id,
      description: 'Read the private sanitized proof bytes for an authorized parcel reader. No public or signed URL is returned.',
      parameters: [{ name: 'parcelId', in: 'path', required: true, schema: { type: 'string', pattern: '^[1-9][0-9]{0,17}$' } }],
      responses: {
        '200': { description: 'Verified proof bytes.', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } }, 'image/png': { schema: { type: 'string', format: 'binary' } } } },
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
