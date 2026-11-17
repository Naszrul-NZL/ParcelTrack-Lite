import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SOURCE = /\.[cm]?[jt]sx?$/;
function filesUnder(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(path.join(directory, entry.name)) : SOURCE.test(entry.name) ? [path.join(directory, entry.name)] : []);
}

/** Every local source module reachable from `entry` through imports, re-exports and literal dynamic imports. */
export function reachableFrom(entry: string, root: string, seen = new Set<string>()) {
  root = fs.realpathSync(root);
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  const visit = (file: string) => {
    const real = fs.realpathSync(file);
    if (seen.has(real) || !SOURCE.test(real)) return;
    seen.add(real);
    const text = fs.readFileSync(real, 'utf8');
    const source = ts.createSourceFile(real, text, ts.ScriptTarget.Latest, true);
    const specifiers: string[] = [];
    const walk = (node: ts.Node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]) {
        if (!ts.isStringLiteralLike(node.arguments[0])) throw new Error('Computed imports cannot be verified: ' + path.relative(root, real));
        specifiers.push(node.arguments[0].text);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
    for (const specifier of specifiers) {
      const resolved = ts.resolveModuleName(specifier, real, options, ts.sys).resolvedModule?.resolvedFileName;
      // The resolver returns forward slashes on Windows; compare real, normalized paths.
      if (!resolved) continue;
      const local = fs.existsSync(resolved) ? fs.realpathSync(resolved) : path.normalize(resolved);
      if (!local.split(path.sep).includes('node_modules') && local.startsWith(root + path.sep)) visit(local);
    }
  };
  visit(entry);
  return seen;
}

/** Fails when any module under `directory` can reach a module whose path matches `forbidden`. */
export function assertUnreachable(root: string, directory: string, forbidden: RegExp) {
  const absolute = fs.realpathSync(path.resolve(root));
  const offenders: string[] = [];
  const display = (file: string) => path.relative(absolute, file).replaceAll(path.sep, '/');
  for (const file of filesUnder(path.join(absolute, directory))) {
    for (const reached of reachableFrom(file, absolute)) {
      if (forbidden.test(display(reached))) offenders.push(`${display(file)} -> ${display(reached)}`);
    }
  }
  if (offenders.length) throw new Error('Forbidden test shortcut is reachable:\n' + offenders.join('\n'));
}
