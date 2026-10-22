import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import typescript from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default defineConfig([
  js.configs.recommended, ...typescript.configs.recommended, hooks.configs.flat.recommended,
  globalIgnores(['.next/**', 'node_modules/**', 'checkpoint-demo/**', 'infra/supabase/vendor/**', 'deliverables/**', 'next-env.d.ts']),
  { files: ['src/shared/**/*', 'src/features/**/*'], rules: {
    'no-restricted-imports': ['error', { patterns: ['@/server/*', '**/server/**', 'pg', 'argon2', 'node:*'] }],
  } },
  { files: ['**/*.mjs','db/migrations/*.js'], rules: { '@typescript-eslint/no-require-imports': 'off', 'no-undef':'off' } },
  {files:['src/server/**/*.ts'],rules:{'no-restricted-imports':['error',{patterns:['**/scripts/env','**/.local/**']}] }},
]);
