import fs from 'node:fs';
export function lintSql(sql:string):string[]{
 const problems:string[]=[];
 for(const block of sql.split(/(?=CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+)/i)){
  if(!/SECURITY\s+DEFINER/i.test(block))continue;
  const name=block.match(/FUNCTION\s+(app\.[a-z_]+)/i)?.[1];
  if(!name){problems.push('Function must be schema-qualified.');continue;}
  if(!/SET\s+search_path\s*=\s*pg_catalog\s*,\s*app\s*,\s*pg_temp/i.test(block))problems.push(name+': missing trusted search path');
  if(!/OWNER TO (?:domain_writer|auth_fn_owner|lookup_fn_owner|maintenance_fn_owner|ops_fn_owner)/i.test(block))problems.push(name+': missing narrow owner');
  if(!/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC/i.test(block))problems.push(name+': missing PUBLIC revocation');
  if(!/GRANT EXECUTE ON FUNCTION/i.test(block))problems.push(name+': missing selective execute grant');
  if(/\bEXECUTE\s+(?:format|p_|query|sql|\$)/i.test(block))problems.push(name+': unreviewed dynamic SQL');
 }
 return problems;
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/scripts/sql-lint.ts')){
 const errors=fs.readdirSync('db/sql').filter(n=>n.endsWith('.sql')).flatMap(n=>lintSql(fs.readFileSync('db/sql/'+n,'utf8')));
 if(errors.length)throw new Error(errors.join('\n'));console.log('Privileged SQL hardening checks passed.');
}
