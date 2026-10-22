import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url)),'server-only':fileURLToPath(new URL('./tests/harness/server-only.ts',import.meta.url))}},
 test:{projects:[
  {extends:true,test:{name:'unit',environment:'node',include:['tests/unit/**/*.test.ts']}},
  {extends:true,test:{name:'component',environment:'jsdom',include:['tests/component/**/*.test.tsx'],setupFiles:['tests/harness/component-setup.ts']}},
  {extends:true,test:{name:'integration',environment:'node',include:['tests/integration/**/*.test.ts'],setupFiles:['tests/harness/integration-setup.ts'],fileParallelism:false,testTimeout:20_000,hookTimeout:30_000}},
 ]},
});
