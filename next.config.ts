import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/**/*': ['./contracts/**/*'],
  },
  serverExternalPackages: [
    '@prisma/client',
    'pg',
    '@midnight-ntwrk/compact-runtime',
    '@midnight-ntwrk/midnight-js',
    '@midnight-ntwrk/wallet-sdk',
    '@anon-aadhaar/core',
  ],
};

export default nextConfig;
