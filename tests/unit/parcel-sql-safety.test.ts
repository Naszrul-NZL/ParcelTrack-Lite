import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const MODULE = 'src/server/modules/parcels';

type QueryCall = { file: string; line: number; text: string; constant: boolean };

// Every `.query(...)` call in the parcels module must send fixed SQL text. Request values travel only as bound
// parameters, so the first argument has to be a plain string or a template literal with no `${...}` substitution.
function scan(file: string, text: string): QueryCall[] {
  const calls: QueryCall[] = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'query') {
      const [sql] = node.arguments;
      calls.push({
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        text: sql?.getText(source) ?? '',
        constant: sql !== undefined && (ts.isStringLiteral(sql) || ts.isNoSubstitutionTemplateLiteral(sql)),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

const queryCalls = () => fs.readdirSync(MODULE).filter(name => /\.tsx?$/.test(name)).flatMap(name => {
  const file = path.posix.join(MODULE, name);
  return scan(file, fs.readFileSync(file, 'utf8'));
});

describe('M2-PH2-TC17 parcel SQL is never assembled from request values', () => {
  it('sends only constant SQL text from src/server/modules/parcels', () => {
    const calls = queryCalls();
    // Guards against a vacuous pass if the module is moved or the calls are renamed.
    expect(calls.map(call => call.file)).toEqual(expect.arrayContaining([
      `${MODULE}/read-service.ts`, `${MODULE}/register-handler.ts`,
    ]));
    expect(calls.filter(call => !call.constant).map(call => `${call.file}:${call.line} ${call.text.slice(0, 60)}`))
      .toEqual([]);
  });

  it('flags interpolated, concatenated and computed SQL text', () => {
    const calls = scan('example.ts', [
      'client.query(`SELECT * FROM app.parcel WHERE id = ${id}`);',
      "client.query('SELECT * FROM app.parcel ORDER BY ' + sort);",
      'client.query(sql, [id]);',
      "client.query('SELECT 1', [id]);",
    ].join('\n'));
    expect(calls.map(call => call.constant)).toEqual([false, false, false, true]);
  });
});
