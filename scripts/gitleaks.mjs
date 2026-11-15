import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = '8.30.1';
const releases = {
  'linux-x64': ['linux_x64.tar.gz', '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'],
  'win32-x64': ['windows_x64.zip', 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e'],
};

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function git(cwd, ...args) {
  const result = run('git', args, cwd);
  if (result.status !== 0) throw new Error('Git operation failed: ' + args[0]);
  return result.stdout;
}

function syntheticValue() {
  // Fixed, nonfunctional fixture: high entropy and no pinned-rule stopword substrings.
  return ['0123456789', 'qazwsxedcrfvtgbyhnujmikolp'].join('');
}

async function temporary(work) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ptl-secret-scan-'));
  try {
    return await work(directory);
  } finally {
    await removeTemporary(directory);
  }
}

async function removeTemporary(directory) {
  // Resolve the generated directory before recursive cleanup on Windows.
  const resolved = await fs.realpath(directory);
  const parent = await fs.realpath(os.tmpdir());
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('ptl-secret-scan-')) {
    throw new Error('Refusing cleanup outside the scanner temporary directory.');
  }
  await fs.rm(resolved, { recursive: true, force: true });
}

async function install() {
  const release = releases[process.platform + '-' + process.arch];
  if (!release) throw new Error('Pinned Gitleaks installer supports Linux x64 and Windows x64.');
  const directory = path.join(root, '.local', 'tools', 'gitleaks-' + version);
  const executable = path.join(directory, process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks');
  const archive = path.join(directory, 'gitleaks_' + version + '_' + release[0]);
  await fs.mkdir(directory, { recursive: true });
  let bytes;
  try { bytes = await fs.readFile(archive); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!bytes) {
    const response = await fetch('https://github.com/gitleaks/gitleaks/releases/download/v' + version + '/gitleaks_' + version + '_' + release[0], { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error('Gitleaks download failed: HTTP ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== release[1]) {
    throw new Error('Gitleaks archive checksum mismatch.');
  }
  await fs.writeFile(archive, bytes);
  // Always extract from the verified archive, even when an executable is cached.
  const extracted = run('tar', ['-xf', archive, '-C', directory], root);
  if (extracted.status !== 0) throw new Error('Gitleaks extraction failed.');
  const installed = run(executable, ['version'], root);
  if (installed.status !== 0 || installed.stdout.trim() !== version) throw new Error('Unexpected Gitleaks version.');
  return executable;
}

async function scan(executable, repository, mode) {
  return temporary(async directory => {
    const target = mode === 'tree' ? path.join(directory, 'tree') : repository;
    if (mode === 'tree') {
      await fs.mkdir(target);
      const files = git(repository, 'ls-files', '-c', '-o', '--exclude-standard', '-z').split('\0').filter(Boolean);
      for (const file of new Set(files)) {
        const source = path.resolve(repository, file);
        const destination = path.resolve(target, file);
        if (!destination.startsWith(target + path.sep) || !source.startsWith(path.resolve(repository) + path.sep)) {
          throw new Error('Invalid Git-visible path.');
        }
        let stat;
        try { stat = await fs.lstat(source); } catch (error) {
          if (error.code === 'ENOENT') continue; // Tracked file deleted in the working tree.
          throw error;
        }
        if (!stat.isFile()) throw new Error('Scanner requires regular Git-visible files: ' + file);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(source, destination);
      }
    } else if (git(repository, 'rev-parse', '--is-shallow-repository').trim() !== 'false') {
      throw new Error('History scan requires a full checkout (fetch-depth: 0).');
    }
    const report = path.join(directory, 'report.json');
    const result = run(executable, [mode === 'tree' ? 'dir' : 'git', target,
      '--config', path.join(root, '.gitleaks.toml'), '--gitleaks-ignore-path', directory,
      '--ignore-gitleaks-allow', '--redact=100', '--no-banner', '--no-color',
      '--exit-code', '23', '--report-format', 'json', '--report-path', report,
      ...(mode === 'history' ? ['--log-opts=--all --full-history -m'] : []),
    ], directory);
    if (result.status !== 0 && result.status !== 23) throw new Error('Gitleaks scan failed (not a finding).');
    const findings = JSON.parse(await fs.readFile(report, 'utf8'));
    if (!Array.isArray(findings) || (result.status === 23) !== (findings.length > 0)) {
      throw new Error('Gitleaks returned an inconsistent finding report.');
    }
    // Raw scanner output and reports stay private; never print matched lines or values.
    return findings.map(finding => ({ rule: finding.RuleID,
      file: mode === 'tree' ? path.relative(target, finding.File) : finding.File, line: finding.StartLine }));
  });
}

async function controls(executable) {
  await temporary(async repository => {
    git(repository, 'init', '--quiet');
    git(repository, 'config', 'user.name', 'Scanner negative control');
    git(repository, 'config', 'user.email', 'scanner@example.invalid');
    await fs.writeFile(path.join(repository, 'README.md'), 'Disposable scanner controls.\n');
    const upstream = path.join(repository, 'infra/supabase/vendor/tests');
    await fs.mkdir(upstream, { recursive: true });
    const nonce = Buffer.from('the sample nonce').toString('base64');
    await fs.writeFile(path.join(upstream, 'test-auth-keys.sh'), 'Sec-WebSocket-Key: ' + nonce + '"\n');
    const variables = [['MINIO', 'ROOT', 'PASSWORD'], ['GLOBAL', 'S3', 'BUCKET']].map(parts => parts.join('_')).join(', ');
    await fs.writeFile(path.join(upstream, 'test-s3-backend.sh'), variables + '\n');
    const historical = path.join(repository, 'deliverables/week-5-checkpoint');
    await fs.mkdir(historical, { recursive: true });
    const technologies = ['SQLAlchemy/psycopg', 'FastAPI'].reverse().join(', ');
    await fs.writeFile(path.join(historical, 'report-source.md'), technologies + ' and Alembic\n');
    git(repository, 'add', '.');
    git(repository, '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Clean control');
    for (const mode of ['tree', 'history']) {
      if ((await scan(executable, repository, mode)).length) throw new Error('Clean control failed: ' + mode);
    }
    const file = path.join(repository, 'canary.txt');
    // Construct a nonfunctional provider-shaped value only in the throwaway repository.
    const canary = ['gh', 'p_'].join('') + syntheticValue();
    await fs.writeFile(file, 'token = "' + canary + '"\n');
    const genericFile = path.join(upstream, 'test-auth-keys.sh');
    await fs.appendFile(genericFile, 'api_key = "' + syntheticValue() + '"\n');
    const treeFindings = await scan(executable, repository, 'tree');
    if (!treeFindings.some(f => f.rule === 'github-pat' && f.file === 'canary.txt') ||
        !treeFindings.some(f => f.rule === 'generic-api-key' && f.file.replaceAll('\\', '/') === 'infra/supabase/vendor/tests/test-auth-keys.sh')) {
      throw new Error('Working-tree negative control or allowlist boundary was not detected.');
    }
    if ((await scan(executable, repository, 'history')).length) throw new Error('Uncommitted value leaked into history control.');
    git(repository, 'add', '.');
    git(repository, '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Synthetic historical control');
    await fs.unlink(file);
    git(repository, 'restore', '--source=HEAD~1', '--', 'infra/supabase/vendor/tests/test-auth-keys.sh');
    git(repository, 'add', '-u');
    git(repository, '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Remove historical control');
    if ((await scan(executable, repository, 'tree')).length) throw new Error('Deleted control remains in tree.');
    if (!(await scan(executable, repository, 'history')).some(f => f.rule === 'github-pat')) {
      throw new Error('Deleted-history negative control was not detected.');
    }
    console.log('PASS: clean tree/history; working-tree canary rejected; deleted-history canary rejected.');
  });
  await temporary(async repository => {
    git(repository, 'init', '--quiet', '--initial-branch=main');
    git(repository, 'config', 'user.name', 'Scanner merge control');
    git(repository, 'config', 'user.email', 'scanner@example.invalid');
    const commit = message => git(repository, '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-am', message);
    const file = path.join(repository, 'resolution.txt');
    await fs.writeFile(file, 'Base content.\n');
    git(repository, 'add', '.');
    commit('Merge control base');
    git(repository, 'switch', '--quiet', '-c', 'side');
    await fs.writeFile(file, 'Side content.\n');
    commit('Side edit');
    git(repository, 'switch', '--quiet', 'main');
    await fs.writeFile(file, 'Main content.\n');
    commit('Main edit');
    const merge = run('git', ['-c', 'core.hooksPath=', 'merge', '--no-ff', '--no-commit', 'side'], repository);
    if (merge.status !== 1 || !(await fs.readFile(file, 'utf8')).includes('<<<<<<<')) {
      throw new Error('Merge control did not produce the expected conflict.');
    }
    const canary = ['gh', 'p_'].join('') + syntheticValue();
    await fs.writeFile(file, 'token = "' + canary + '"\n');
    git(repository, 'add', '.');
    commit('Resolve with a synthetic merge-only canary');
    if (git(repository, 'rev-list', '--parents', '-n', '1', 'HEAD').trim().split(/\s+/).length !== 3) {
      throw new Error('Merge control must have two parents.');
    }
    await fs.unlink(file);
    commit('Remove merge-only canary');
    if ((await scan(executable, repository, 'tree')).length) throw new Error('Merge control tree must be clean.');
    if (!(await scan(executable, repository, 'history')).some(f => f.rule === 'github-pat' && f.file === 'resolution.txt')) {
      throw new Error('Deleted merge-only canary was not detected.');
    }
    console.log('PASS: deleted merge-resolution canary rejected from history.');
  });
}

const action = process.argv[2];
if (!['scan', 'controls'].includes(action)) throw new Error('Use scan or controls.');
const executable = await install();
if (action === 'controls') await controls(executable);
else {
  let count = 0;
  for (const mode of ['tree', 'history']) {
    const findings = await scan(executable, root, mode);
    for (const finding of findings) console.error(JSON.stringify({ mode, ...finding }));
    console.log(mode + ': ' + findings.length + ' finding(s).');
    count += findings.length;
  }
  if (count) process.exitCode = 1;
}
