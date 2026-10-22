import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const revision = 'b8483fc454ed2d6fb2b3637fc5da928bc9b1ff6b';
const target = path.join(root, 'infra/supabase/vendor');
const api = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('Upstream fetch failed: ' + r.status); return r.json(); };
const top = await api('https://api.github.com/repos/supabase/supabase/git/trees/' + revision);
const docker = top.tree.find((item) => item.path === 'docker');
const tree = await api('https://api.github.com/repos/supabase/supabase/git/trees/' + docker.sha + '?recursive=1');
const files = tree.tree.filter((item) => item.type === 'blob' && item.path !== '.env.example');
await fs.mkdir(target, {recursive:true});
for (let i = 0; i < files.length; i += 6) {
  await Promise.all(files.slice(i, i + 6).map(async (item) => {
    const dest = path.resolve(target, item.path);
    if (!dest.startsWith(target + path.sep)) throw new Error('Invalid upstream path');
    const r = await fetch('https://raw.githubusercontent.com/supabase/supabase/' + revision + '/docker/' + item.path);
    if (!r.ok) throw new Error('Upstream file unavailable');
    await fs.mkdir(path.dirname(dest), {recursive:true});
    await fs.writeFile(dest, new Uint8Array(await r.arrayBuffer()));
  }));
}
for (const [remote, local] of [['LICENSE', 'LICENSE'], ['docker/.env.example', 'env-template.txt']]) {
  const r = await fetch('https://raw.githubusercontent.com/supabase/supabase/' + revision + '/' + remote);
  if (!r.ok) throw new Error('Upstream template unavailable');
  const body = await r.text();
  // The full original environment template is private build input, never a usable default.
  const dest = local === 'LICENSE' ? path.join(target, local) : path.join(root, '.local/upstream-env-template.txt');
  await fs.mkdir(path.dirname(dest), {recursive:true}); await fs.writeFile(dest, body);
}
await fs.writeFile(path.join(root, 'infra/supabase/UPSTREAM.json'), JSON.stringify({repository:'https://github.com/supabase/supabase', revision, directory:'docker', files:files.length}, null, 2) + '\n');
console.log('Pinned full Supabase configuration downloaded: ' + files.length + ' files. No upstream script executed.');
