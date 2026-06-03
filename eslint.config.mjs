// Obsidian guideline lint (eslint-plugin-obsidianmd) — STEP 3: report-only.
//
// This config is intentionally NOT wired as a blocking gate yet. It runs via
// `npm run lint:obsidian:report` (always exit 0) and as a report lane in
// run-gates.mjs. Once the blast radius is understood (step 4), individual
// rules can be promoted to errors and the overlapping custom regex checks
// retired per docs/engineering/audits/eslint-rule-mapping.md.
//
// Type-aware rules require parserOptions.project; tsconfig includes
// src/**/*.ts and excludes tests, so linting is scoped to non-test src files.
import tsparser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  {
    ignores: [
      'release/**',
      'dist/**',
      'main.js',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      'scripts/**',
      'tests/**',
      'src/**/*.test.ts',
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
