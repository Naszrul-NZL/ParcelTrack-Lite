import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req,res)=>{
  let file;
  try { file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname)); } catch { res.writeHead(400).end('Invalid request'); return; }
  if (file===root) file=path.join(root,'index.html');
  if (!file.startsWith(root+path.sep)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end('File not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);});
});
server.on('error',error=>{if(error.code==='EADDRINUSE'){server.listen(0,'127.0.0.1');}else{console.error(error.message);process.exitCode=1;}});
server.listen(4173,'127.0.0.1',()=>{const address=server.address();console.log(`ParcelTrack Lite demo: http://127.0.0.1:${address.port}`);console.log('Open this address in your browser. Keep this window open. Press Ctrl+C to stop.');});
