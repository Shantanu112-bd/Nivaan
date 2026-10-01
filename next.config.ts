import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/**/*': ['./contracts/**/*'],
  },
  turbopack: {
    resolveAlias: {
      '@anon-aadhaar/core': './node_modules/@anon-aadhaar/core/dist/index.js',
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@anon-aadhaar/core': require.resolve('@anon-aadhaar/core/dist/index.js'),
    };
    return config;
  },
  serverExternalPackages: [
    '@prisma/client',
    'pg',
    '@midnight-ntwrk/compact-runtime',
    '@midnight-ntwrk/compact-js',
    '@midnight-ntwrk/ledger-v8',
    '@midnight-ntwrk/midnight-js',
    '@midnight-ntwrk/midnight-js-contracts',
    '@midnight-ntwrk/midnight-js-http-client-proof-provider',
    '@midnight-ntwrk/midnight-js-indexer-public-data-provider',
    '@midnight-ntwrk/midnight-js-node-zk-config-provider',
    '@midnight-ntwrk/midnight-js-network-id',
    '@midnight-ntwrk/midnight-js-protocol',
    '@midnight-ntwrk/wallet-sdk',
    'ws',
  ],
};

export default nextConfig;
