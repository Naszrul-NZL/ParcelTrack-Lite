import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { listAdminParcels } from '@/server/modules/delivery/admin-service';
import { listRiderParcels } from '@/server/modules/delivery/rider-service';

const MODULE = 'src/server/modules/delivery';

type QueryCall = { file: string; line: number; text: string; constant: boolean };

const isQueryCallee = (callee: ts.Expression) =>
  (ts.isPropertyAccessExpression(callee) && callee.name.text === 'query')
  || (ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression)
    && callee.argumentExpression.text === 'query');

function scan(file: string, text: string): QueryCall[] {
  const calls: QueryCall[] = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isQueryCallee(node.expression)) {
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

const queryCalls = () => fs.readdirSync(MODULE, { recursive: true, encoding: 'utf8' })
  .filter(name => /\.tsx?$/.test(name))
  .flatMap(name => {
    const file = path.posix.join(MODULE, name.split(path.sep).join('/'));
    return scan(file, fs.readFileSync(file, 'utf8'));
  });

describe('M3-PH2-TC15 delivery SQL never includes request values', () => {
  it('sends only constant SQL text from src/server/modules/delivery', () => {
    const calls = queryCalls();
    expect(calls.map(call => call.file)).toContain(`${MODULE}/rider-service.ts`);
    expect(calls.filter(call => !call.constant).map(call => `${call.file}:${call.line} ${call.text.slice(0, 60)}`))
      .toEqual([]);
  });

  it('flags interpolated, concatenated and computed SQL text', () => {
    const calls = scan('example.ts', [
      'client.query(`SELECT * FROM app.parcel WHERE id = ${id}`);',
      "client.query('SELECT * FROM app.parcel WHERE id = ' + id);",
      'client.query(sql, [id]);',
      "client.query('SELECT 1', [id]);",
    ].join('\n'));
    expect(calls.map(call => call.constant)).toEqual([false, false, false, true]);
  });

  it('keeps even a hostile Rider identity in the bound parameter array', async () => {
    const riderId = "7' OR true --";
    const query = vi.fn().mockResolvedValue({ rows: [{ items: [], total: '0' }] });
    await listRiderParcels({ query } as unknown as PoolClient, {
      id: riderId, username: 'rider.a', displayName: 'Rider A', role: 'RIDER',
      mustChangePassword: false, sessionVersion: 1,
    }, { page: 1, pageSize: 20 });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).not.toContain(riderId);
    expect(query.mock.calls[0][1]).toEqual([riderId, null, 20, 0]);
  });

  it('keeps hostile Admin parcel filters in the bound parameter array', async () => {
    const status = "ASSIGNED' OR true --";
    const riderId = "7' OR true --";
    const query = vi.fn().mockResolvedValue({ rows: [{ items: [], total: '0' }] });
    await listAdminParcels({ query } as unknown as PoolClient, {
      status: status as 'ASSIGNED', riderId, needsReassignment: true, page: 2, pageSize: 25,
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).not.toContain(status);
    expect(query.mock.calls[0][0]).not.toContain(riderId);
    expect(query.mock.calls[0][1]).toEqual([status, riderId, true, 25, 25]);
  });
});
