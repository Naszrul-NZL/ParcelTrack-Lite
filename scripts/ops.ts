import './env';
import fs from 'node:fs';
import { Client } from 'pg';
import { PasswordService } from '../src/server/modules/auth/password';
import { createAccountJournal, readJournal } from '../src/server/modules/auth/account-journal';
import { required } from './env';
import {
  describeFailure, lockAccount, lockAccountsFromList, maintenanceState, parseUsernameList, provisionAdmin, purgeSessions,
  quarantineAfterRestore, reconcileAccounts, recoverAccount, setMaintenance,
} from './ops-commands';

// Private operations command line. It signs in as `ops_runtime` and is never part of the web service: the web process
// has no operator credentials, and `scripts/` is outside the web import graph.
const USAGE = `Usage (npm run ops -- <command>):
  provision-admin --username <name> --display-name "<name>" [--password-stdin]
  lock-account --username <name>
  lock-accounts --from-file <file>
  recover-account --username <name> [--password-stdin]
  purge-sessions --username <name> | --all
  reconcile-accounts --from-journal <file> --since <ISO time of the backup>
  quarantine-after-restore --confirm
  maintenance on --minutes <1-1440> | off | status
Passwords are read without echo from the terminal, or from standard input with --password-stdin. They are never arguments.`;

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

async function readPassword(fromStdin: boolean, label: string): Promise<string> {
  if (fromStdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  }
  if (!process.stdin.isTTY) throw new Error('No terminal to read the password from. Use --password-stdin.');
  process.stderr.write(`${label} (not shown): `);
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

const journal = createAccountJournal({ path: process.env.ACCOUNT_JOURNAL_PATH });
const [command, ...args] = process.argv.slice(2);
const client = new Client({ connectionString: connection() });
let exit = 0;
const fail = (message: string, code = 2) => { console.error(message); exit = code; };
try {
  if (command === 'provision-admin') {
    const username = option(args, '--username');
    const displayName = option(args, '--display-name');
    if (!username || !displayName || args.includes('--password')) { console.error(USAGE); process.exit(2); }
    const password = await readPassword(args.includes('--password-stdin'), 'Admin password');
    await client.connect();
    const result = await provisionAdmin(client, { username, displayName, password }, new PasswordService(1));
    if ('error' in result) fail(result.error);
    else console.log(result.created ? `Admin ${username} created. They must change the password at first sign-in.` : `Admin ${username} already exists. Nothing changed.`);
  } else if (command === 'lock-account') {
    const username = option(args, '--username');
    if (!username) { console.error(USAGE); process.exit(2); }
    await client.connect();
    const result = await lockAccount(client, username, journal);
    if (!result.found) fail('No account has that username.');
    else console.log(result.changed ? `Account ${username} is locked and signed out everywhere.` : `Account ${username} was already locked. Nothing changed.`);
  } else if (command === 'lock-accounts') {
    const file = option(args, '--from-file');
    if (!file) { console.error(USAGE); process.exit(2); }
    await client.connect();
    const result = await lockAccountsFromList(client, parseUsernameList(fs.readFileSync(file, 'utf8')), journal);
    console.log(JSON.stringify(result));
    if (result.notFound.length) exit = 2;
  } else if (command === 'recover-account') {
    const username = option(args, '--username');
    if (!username || args.includes('--password')) { console.error(USAGE); process.exit(2); }
    const password = await readPassword(args.includes('--password-stdin'), 'New temporary password');
    await client.connect();
    const result = await recoverAccount(client, { username, password }, new PasswordService(1), journal);
    if ('error' in result) fail(result.error); else console.log(`Account ${username} is active again. They must change the password at next sign-in.`);
  } else if (command === 'purge-sessions') {
    const username = option(args, '--username');
    if (!username && !args.includes('--all')) { console.error(USAGE); process.exit(2); }
    await client.connect();
    const result = await purgeSessions(client, username ?? null);
    if ('error' in result) fail(result.error); else console.log(`${result.removed} session(s) ended.`);
  } else if (command === 'reconcile-accounts') {
    const file = option(args, '--from-journal');
    const since = option(args, '--since');
    if (!file || !since || Number.isNaN(Date.parse(since))) { console.error(USAGE); process.exit(2); }
    await client.connect();
    const result = await reconcileAccounts(client, readJournal(file, new Date(since)));
    if ('error' in result) fail(result.error); else console.log(JSON.stringify(result));
  } else if (command === 'quarantine-after-restore') {
    if (!args.includes('--confirm')) { console.error('This disables every Rider and forces every account to change its password. Add --confirm to run it.'); process.exit(2); }
    await client.connect();
    console.log(JSON.stringify(await quarantineAfterRestore(client)));
  } else if (command === 'maintenance') {
    const [mode] = args;
    await client.connect();
    if (mode === 'status') console.log(JSON.stringify(await maintenanceState(client)));
    else if (mode === 'on' || mode === 'off') {
      const result = await setMaintenance(client, mode === 'on' ? Number(option(args, '--minutes')) : null);
      if ('error' in result) fail(result.error); else console.log(JSON.stringify(result));
    } else fail(USAGE);
  } else fail(USAGE);
} catch (error) {
  console.error(describeFailure(error));
  exit = 1;
} finally {
  await client.end().catch(() => undefined);
}
process.exit(exit);
