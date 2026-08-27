// Vitest config for backend unit/integration tests.
//
// docs/architecture.md pins "Vitest/Jest (unit)"; Vitest is chosen for ESM-native
// execution (matching Prisma 7's client and Next 16) and first-class module
// mocking (vi.mock/vi.hoisted), which lets service tests run against a mocked
// `@/lib/db/prisma` — no generated client or live DB required.
//
// The `@` alias mirrors tsconfig's `@/* -> ./*` so the tests and the modules under
// test resolve `@/lib/...` identically.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    // `npm test` runs from the project root, so cwd is the alias base. Using
    // process.cwd() avoids ESM/CJS __dirname ambiguity in the Vite-loaded config.
    alias: { '@': process.cwd() },
  },
});
