// Shared PrismaClient singleton for the NIVAAN backend.
//
// Prisma 7 removed the Rust query engine; a driver adapter is now mandatory. We
// use the pg adapter (@prisma/adapter-pg). The client is emitted by the new
// `prisma-client` generator into ./generated/prisma (gitignored) — run
// `npm run db:generate` after schema changes. Schema: lib/db/schema.prisma.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

const createPrismaClient = () => {
  // process.env.DATABASE_URL is populated by Next.js (.env.local) at runtime.
  // Constructing the pool with an undefined connection string does NOT throw; a
  // query only fails if actually executed without a reachable DB — so importing
  // this module is always safe, even before DATABASE_URL is provisioned. This
  // mirrors lib/config/env.ts's lazy philosophy.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
};

// Cache the client on globalThis in dev so Next.js hot-reload doesn't leak pools.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export generated model types + enums (CredentialStatus, ChainTarget,
// ProofStatus, and the model row types) so services import them from here rather
// than hardcoding the generated output path.
export * from './generated/prisma/client';
