import './env';
import { Client } from 'pg';
import { PasswordService } from '../src/server/modules/auth/password';
import { required } from './env';
import { describeFailure, maintenanceState, provisionAdmin, setMaintenance } from './ops-commands';

// Private operations command line. It signs in as `ops_runtime` and is never part of the web service: the web process
// has no operator credentials, and `scripts/` is outside the web import graph.
const USAGE = `Usage:
  npm run ops -- provision-admin --username <name> --display-name "<name>" [--password-stdin]
  npm run ops -- maintenance on --minutes <1-1440>
  npm run ops -- maintenance off
  npm run ops -- maintenance status
The Admin password is read without echo from the terminal, or from standard input with --password-stdin. It is never an argument.`;

function connection() {
  if (process.env.OPS_DATABASE_URL) return process.env.OPS_DATABASE_URL;
  // Local stacks: the operator file holds the generated ops_runtime password next to the bootstrap address.
  const url = new URL(required('BOOTSTRAP_DATABASE_URL'));
  url.username = 'ops_runtime';
  url.password = encodeURIComponent(required('DB_PASSWORD_OPS_RUNTIME'));
  return url.toString();
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readPassword(fromStdin: boolean): Promise<string> {
  if (fromStdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  }
  if (!process.stdin.isTTY) throw new Error('No terminal to read the password from. Use --password-stdin.');
  process.stderr.write('Admin password (not shown): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise(resolve => {
    let value = '';
    const onData = (key: string) => {
      for (const char of key) {
        if (char === '\u0003') { process.stderr.write('\n'); process.exit(130); }
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData);
          process.stderr.write('\n'); resolve(value); return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1); else value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}

const [command, ...args] = process.argv.slice(2);
const client = new Client({ connectionString: connection() });
let exit = 0;
try {
  if (command === 'provision-admin') {
    const username = option(args, '--username');
    const displayName = option(args, '--display-name');
    if (!username || !displayName || args.includes('--password')) { console.error(USAGE); process.exit(2); }
    const password = await readPassword(args.includes('--password-stdin'));
    await client.connect();
    const result = await provisionAdmin(client, { username, displayName, password }, new PasswordService(1));
    if ('error' in result) { console.error(result.error); exit = 2; }
    else console.log(result.created ? `Admin ${username} created. They must change the password at first sign-in.` : `Admin ${username} already exists. Nothing changed.`);
  } else if (command === 'maintenance') {
    const [mode] = args;
    await client.connect();
    if (mode === 'status') console.log(JSON.stringify(await maintenanceState(client)));
    else if (mode === 'on' || mode === 'off') {
      const result = await setMaintenance(client, mode === 'on' ? Number(option(args, '--minutes')) : null);
      if ('error' in result) { console.error(result.error); exit = 2; } else console.log(JSON.stringify(result));
    } else { console.error(USAGE); exit = 2; }
  } else { console.error(USAGE); exit = 2; }
} catch (error) {
  console.error(describeFailure(error));
  exit = 1;
} finally {
  await client.end().catch(() => undefined);
}
process.exit(exit);
