import { it,expect } from 'vitest';
import { lintSql } from '../../scripts/sql-lint';
import fs from 'node:fs';
it('M2-PH1-TC03 rejects incomplete or unsafe privileged functions',()=>{
 const good=fs.readFileSync('db/templates/hardened-function.sql.example','utf8');expect(lintSql(good)).toEqual([]);
 for(const fragment of ['SET search_path=pg_catalog,app,pg_temp','REVOKE ALL ON FUNCTION app.example_operation() FROM PUBLIC;','ALTER FUNCTION app.example_operation() OWNER TO domain_writer;','GRANT EXECUTE ON FUNCTION app.example_operation() TO app_runtime;'])expect(lintSql(good.replace(fragment,''))).not.toEqual([]);
 expect(lintSql(good.replace('  NULL;','  EXECUTE p_sql;'))).not.toEqual([]);
});
