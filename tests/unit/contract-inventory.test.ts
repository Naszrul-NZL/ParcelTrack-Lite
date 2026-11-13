import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { implementedEndpoints, assertProductionImportBoundary, assertPlanEndpointParity } from '../../scripts/contract-inventory';

function workspace(files: Record<string, string>, run: (directory: string) => void) {
  const base = path.resolve('.local/contract-probes');
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'case-'));
  const relative = path.relative(base, path.resolve(directory));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unmanaged contract fixture.');
  try {
    const content = { 'tsconfig.json': JSON.stringify({ compilerOptions: { allowJs: true, module: 'esnext', moduleResolution: 'bundler', baseUrl: '.', paths: { '@/*': ['./src/*'] } } }), ...files };
    for (const [name, text] of Object.entries(content)) {
      const file = path.join(directory, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

it('CT-01 discovers aliased Route Handler exports and dynamic segments without publishing unimplemented endpoints', () => {
  workspace({
    'src/app/api/v1/(private)/parcels/[parcelId]/route.ts': 'const read = () => new Response(); export { read as GET }; export const dynamic="force-dynamic";',
  }, directory => {
    expect(implementedEndpoints(directory)).toEqual([expect.objectContaining({ id: 'A12', method: 'GET', path: '/api/v1/parcels/{parcelId}' })]);
  });
});

it('CT-01 rejects undeclared methods and paths instead of silently omitting routes', () => {
  workspace({ 'src/app/api/v1/health/route.ts': 'export function POST() { return new Response(); }' }, directory => {
    expect(() => implementedEndpoints(directory)).toThrow('Undeclared API route');
  });
  workspace({ 'src/app/api/v1/debug/route.ts': 'export const GET = () => new Response();' }, directory => {
    expect(() => implementedEndpoints(directory)).toThrow('Undeclared API route');
  });
  workspace({ 'src/app/api/debug/route.ts': 'export const GET = () => new Response();' }, directory => {
    expect(() => implementedEndpoints(directory)).toThrow('Undeclared API route');
  });
});

it('CT-01 checks source registry paths/owners against the authoritative document', () => {
  expect(() => assertPlanEndpointParity()).not.toThrow();
  workspace({ 'docs/shared/system-contract.md': '| A01 | M1 | POST /wrong | Anyone | invented |' }, directory => {
    expect(() => assertPlanEndpointParity(directory)).toThrow('authoritative system-contract');
  });
});

it('CT-02 follows transitive imports and re-exports to reject test/operator code in production', () => {
  workspace({
    'src/main.ts': "import { probe } from '@/feature'; export { probe };",
    'src/feature.ts': "export { probe } from '../tests/harness/override';",
    'tests/harness/override.ts': 'export const probe = true;',
  }, directory => { expect(() => assertProductionImportBoundary(directory)).toThrow(/tests[/\\]harness[/\\]override\.ts/); });
});

it('CT-02 accepts local source/assets and rejects computed import paths', () => {
  workspace({ 'src/main.ts': "import './theme.css'; import { value } from './safe'; export { value };", 'src/safe.ts': 'export const value = 1;', 'src/theme.css': ':root {}' }, directory => {
    expect(() => assertProductionImportBoundary(directory)).not.toThrow();
  });
  workspace({ 'src/main.ts': "const name = './safe'; import(name);", 'src/safe.ts': 'export const value = 1;' }, directory => {
    expect(() => assertProductionImportBoundary(directory)).toThrow('Computed imports');
  });
});

it('CT-02 allows colocated tests but rejects importing them from application code', () => {
  workspace({ 'src/main.ts': 'export const value=1;', 'src/main.test.ts': "import '../tests/fixture';", 'tests/fixture.ts': 'export {};' }, directory => {
    expect(() => assertProductionImportBoundary(directory)).not.toThrow();
    fs.writeFileSync(path.join(directory, 'src/main.ts'), "import './main.test';");
    expect(() => assertProductionImportBoundary(directory)).toThrow('test module');
  });
});
