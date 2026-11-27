import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SOURCE = /\.[cm]?[jt]sx?$/;
function filesUnder(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(path.join(directory, entry.name)) : SOURCE.test(entry.name) ? [path.join(directory, entry.name)] : []);
}

/**
 * Import graph of the local source files under `root`. The TypeScript config is read once, module resolution is
 * cached and each file's direct imports are parsed once, so checking many entry files costs one walk of the graph
 * instead of one walk per entry.
 */
export function createImportGraph(root: string) {
  const base = fs.realpathSync(root);
  const config = ts.readConfigFile(path.join(base, 'tsconfig.json'), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, base).options;
  const resolutionCache = ts.createModuleResolutionCache(base, file => file, options);
  const direct = new Map<string, string[]>();

  function importsOf(file: string): string[] {
    const known = direct.get(file);
    if (known) return known;
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const specifiers: string[] = [];
    const walk = (node: ts.Node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]) {
        if (!ts.isStringLiteralLike(node.arguments[0])) throw new Error('Computed imports cannot be verified: ' + path.relative(base, file));
        specifiers.push(node.arguments[0].text);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
    const local: string[] = [];
    for (const specifier of specifiers) {
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys, resolutionCache).resolvedModule?.resolvedFileName;
      // The resolver returns forward slashes on Windows; compare real, normalized paths.
      if (!resolved) continue;
      const real = fs.existsSync(resolved) ? fs.realpathSync(resolved) : path.normalize(resolved);
      if (!real.split(path.sep).includes('node_modules') && real.startsWith(base + path.sep) && SOURCE.test(real) && fs.existsSync(real)) local.push(real);
    }
    direct.set(file, local);
    return local;
  }

  return {
    root: base,
    /** Every local source module reachable from `entry` through imports, re-exports and literal dynamic imports. */
    reachableFrom(entry: string) {
      const seen = new Set<string>();
      const pending = [fs.realpathSync(entry)];
      while (pending.length) {
        const file = pending.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        pending.push(...importsOf(file));
      }
      return seen;
    },
  };
}

/** Every local source module reachable from `entry`. Kept for single-entry callers; prefer `createImportGraph`. */
export function reachableFrom(entry: string, root: string) {
  return createImportGraph(root).reachableFrom(entry);
}

/** Fails when any module under `directory` can reach a module whose path matches `forbidden`. */
export function assertUnreachable(root: string, directory: string, forbidden: RegExp) {
  const graph = createImportGraph(root);
  const display = (file: string) => path.relative(graph.root, file).replaceAll(path.sep, '/');
  const offenders: string[] = [];
  for (const file of filesUnder(path.join(graph.root, directory))) {
    for (const reached of graph.reachableFrom(file)) {
      if (forbidden.test(display(reached))) offenders.push(`${display(file)} -> ${display(reached)}`);
    }
  }
  if (offenders.length) throw new Error('Forbidden test shortcut is reachable:\n' + offenders.join('\n'));
}
