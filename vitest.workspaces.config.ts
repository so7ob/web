import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@so7ob/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)), '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) } },
  test: { globals: true, include: ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}'], setupFiles: ['./vitest.setup.ts'], environment: 'node', fileParallelism: false },
});
