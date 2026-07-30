import next from 'eslint-config-next';
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * Flat config.
 *
 * `eslint-config-next` v16 ships flat configs natively, so they are imported
 * directly. Wrapping them in `FlatCompat` double-processes the shared plugin
 * objects and throws "Converting circular structure to JSON".
 *
 * Note also that `next lint` was removed in Next.js 16 — this is driven by the
 * ESLint CLI via `npm run lint`.
 */
const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'lib/supabase/database.types.ts',
    ],
  },
  ...next,
  ...coreWebVitals,
  ...typescript,
];

export default eslintConfig;
