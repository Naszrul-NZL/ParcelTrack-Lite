import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { API_CONTRACT, API_PREFIX } from '../src/shared/api-contract';

const HTTP_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']);
const testModule = (file: string) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || file.split(path.sep).includes('__tests__');
function filesUnder(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

function compilerOptions(root: string) {
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error) throw new Error('Cannot read the TypeScript configuration for contract checks.');
  return ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
}

export function implementedEndpoints(root = process.cwd()) {
  const directory = path.join(root, 'src/app');
  const routes = filesUnder(directory).filter(file => /[\\/]route\.[cm]?[jt]sx?$/.test(file));
  const program = ts.createProgram(routes, compilerOptions(root));
  const checker = program.getTypeChecker();
  const implemented: { id: string; method: string; path: string; file: string }[] = [];
  for (const file of routes) {
    const source = program.getSourceFile(file)!;
    const symbol = checker.getSymbolAtLocation(source);
    const methods = symbol ? checker.getExportsOfModule(symbol).map(item => item.name).filter(name => HTTP_METHODS.has(name)) : [];
    if (!methods.length) throw new Error('API route has no HTTP method export: ' + path.relative(root, file));
    const route = '/' + path.relative(directory, path.dirname(file)).split(path.sep).filter(part => part && !part.startsWith('(')).map(part => part.replace(/^\[([^.[\]]+)\]$/, '{$1}')).join('/');
    for (const method of methods) {
      const contract = API_CONTRACT.find(endpoint => endpoint.method === method && API_PREFIX + endpoint.path === route);
      if (!contract) throw new Error(`Undeclared API route: ${method} ${route}`);
      if (implemented.some(endpoint => endpoint.method === method && endpoint.path === route)) throw new Error('Duplicate API route: ' + route);
      implemented.push({ id: contract.id, method, path: route, file: path.relative(root, file) });
    }
  }
  return implemented.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export function assertPlanEndpointParity(root = process.cwd()) {
  const text = fs.readFileSync(path.join(root, 'docs/shared/system-contract.md'), 'utf8');
  const planned = [...text.matchAll(/^\| (A\d\d) \| (M[123]) \| (GET|POST|PATCH|PUT|DELETE) ([^ |]+) \|/gm)].map(([, id, owner, method, route]) => ({ id, owner, method, path: route }));
  const actual = API_CONTRACT.filter(endpoint => endpoint.id !== 'HEALTH');
  if (JSON.stringify(planned) !== JSON.stringify(actual)) throw new Error('Shared endpoint registry differs from the authoritative system-contract table.');
}

export function assertProductionImportBoundary(root = process.cwd()) {
  const options = compilerOptions(root);
  const sourceRoot = fs.realpathSync(path.resolve(root, 'src'));
  const visited = new Set<string>();
  function visit(file: string, chain: string[]) {
    file = fs.realpathSync(file);
    if (visited.has(file) || file.endsWith('.json')) return;
    visited.add(file);
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function resolve(specifier: ts.Expression) {
      if (!ts.isStringLiteralLike(specifier)) throw new Error('Computed imports cannot be verified: ' + path.relative(root, file));
      const name = specifier.text;
      if (name.startsWith('node:')) return;
      const asset = /\.(css|ttf|woff2?|png|svg)$/.test(name) ? path.resolve(path.dirname(file), name) : undefined;
      const module = ts.resolveModuleName(name, file, options, ts.sys).resolvedModule;
      if (module?.isExternalLibraryImport) return;
      const resolvedPath = asset && fs.existsSync(asset) ? asset : module?.resolvedFileName;
      if (!resolvedPath) {
        if (!name.startsWith('.') && !name.startsWith('@/')) return;
        throw new Error(`Unresolved local import ${name} in ${path.relative(root, file)}`);
      }
      const resolved = fs.realpathSync(resolvedPath);
      const relative = path.relative(sourceRoot, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Production import escapes src: ' + [...chain, path.relative(root, file), path.relative(root, resolved)].join(' -> '));
      if (testModule(resolved)) throw new Error('Production import reaches a test module: ' + path.relative(root, resolved));
      if (/\.[cm]?[jt]sx?$/.test(resolved)) visit(resolved, [...chain, path.relative(root, file)]);
    }
    function walk(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) resolve(node.moduleSpecifier);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        if (node.arguments.length !== 1) throw new Error('Unsupported module load in ' + path.relative(root, file));
        resolve(node.arguments[0]);
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  for (const file of filesUnder(sourceRoot).filter(file => /\.[cm]?[jt]sx?$/.test(file) && !testModule(file))) visit(file, []);
}
