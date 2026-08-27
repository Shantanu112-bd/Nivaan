import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

// Prisma 7 discovers this file automatically (the package.json#prisma key was
// removed in v7) and does NOT auto-load env files when a config file is present,
// so load .env.local explicitly for Migrate/CLI commands. (Runtime uses Next.js's
// own .env.local loading — see lib/db/prisma.ts.)
loadEnv({ path: '.env.local' })

export default defineConfig({
  // Non-default schema location per docs/architecture.md repository structure.
  schema: path.join('lib', 'db', 'schema.prisma'),
  datasource: {
    // Read via process.env, NOT prisma's env() helper: env() throws when the
    // variable is unset, and this config executes on EVERY CLI command — so it
    // would break `prisma generate`/`validate` while DATABASE_URL is absent.
    // `undefined` is fine here; only migrate / db push / studio need a reachable
    // database (those are blocked until DATABASE_URL is provisioned).
    url: process.env.DATABASE_URL,
  },
})
