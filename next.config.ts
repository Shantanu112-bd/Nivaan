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
    '@midnight-ntwrk/midnight-js',
    '@midnight-ntwrk/wallet-sdk',
  ],
};

export default nextConfig;
