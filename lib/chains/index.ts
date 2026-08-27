// Chain-adapter registry: maps a ChainTarget to its ChainAdapter so
// verificationService selects an adapter without branching on chain type
// (docs/architecture.md §3).

import { ChainTarget } from '@/lib/db/prisma';

import { evmAdapter } from './evm';
import { sorobanAdapter } from './soroban';
import type { ChainAdapter } from './types';

/** Resolve the registry adapter for a target chain. */
export function getChainAdapter(chain: ChainTarget): ChainAdapter {
  switch (chain) {
    case ChainTarget.SOROBAN:
      return sorobanAdapter;
    case ChainTarget.SEPOLIA:
      return evmAdapter;
    default: {
      // Exhaustiveness: if a new ChainTarget is added, this fails to compile.
      const unreachable: never = chain;
      throw new Error(`No chain adapter for target: ${String(unreachable)}`);
    }
  }
}

export type {
  AttestationFields,
  ChainAdapter,
  OnChainResult,
  SubmitAttestationResult,
} from './types';

/** API wire value for a chain (docs/api-spec.md uses lowercase). */
export type ApiChain = 'soroban' | 'sepolia';

/** Parse an api-spec chain string into a ChainTarget, or null if unsupported. */
export function parseChainTarget(value: string): ChainTarget | null {
  switch (value) {
    case 'soroban':
      return ChainTarget.SOROBAN;
    case 'sepolia':
      return ChainTarget.SEPOLIA;
    default:
      return null;
  }
}

/** Render a ChainTarget as its api-spec wire string. */
export function chainToApiString(chain: ChainTarget): ApiChain {
  return chain === ChainTarget.SOROBAN ? 'soroban' : 'sepolia';
}
