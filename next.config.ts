import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@prisma/client',
    'pg',
    '@midnight-ntwrk/compact-runtime',
    '@midnight-ntwrk/midnight-js',
    '@midnight-ntwrk/wallet-sdk',
  ],
};

export default nextConfig;
