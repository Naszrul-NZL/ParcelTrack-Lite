import './env';
import { required } from './env';
const url=required('SUPABASE_INTERNAL_URL')+'/storage/v1/bucket';
const key=required('STORAGE_SERVICE_KEY');
const headers={Authorization:'Bearer '+key,apikey:key,'Content-Type':'application/json'};
const name=process.env.PROOF_BUCKET??'delivery-proofs';
let current=await fetch(url+'/'+name,{headers});
if(current.status===404||current.status===400){const created=await fetch(url,{method:'POST',headers,body:JSON.stringify({id:name,name,public:false,file_size_limit:3*1024*1024,allowed_mime_types:['image/jpeg','image/png']})});if(!created.ok)throw new Error('Private storage bucket setup failed.');current=await fetch(url+'/'+name,{headers});}
if(!current.ok||(await current.json()).public!==false)throw new Error('Proof storage bucket must remain private.');
console.log('Private proof bucket verified.');
