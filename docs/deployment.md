# Deployment runbook — registry contracts (Soroban + Sepolia)

Concrete, copy-pasteable steps to deploy the two registry contracts to their testnets, capture their addresses, and wire them into the app's environment. This operationalizes `docs/architecture.md` §12 ("Contracts: deployed once to Soroban testnet and Sepolia via CLI, addresses stored in environment variables") and closes the Phase 6 deploy step + the Phase 11 testnet-deployment checklist in `docs/roadmap.md`.

**Scope.** This covers ONLY the two registry contracts (`contracts/evm/contracts/Registry.sol` → Sepolia, `contracts/soroban/src/lib.rs` → Soroban testnet). Midnight/Minokawa deployment (`contracts/midnight/nivaan.compact`) is Phase 5 and is out of scope here — it needs the Midnight toolchain + Proof Server (see `docs/roadmap.md` Phase 5). The app (Vercel) + DB (Supabase/Neon) deploy is Phase 11.

**Everything here is testnet-only.** Per `docs/security-model.md` (MVP-floor) and finding **AF-1**, re-run `npm audit` and revisit all deploy config before any real/mainnet deployment.

---

## 0. The one thing to get right: which key goes where

There are THREE distinct keys in play. Confusing them is the most likely way to produce a registry that rejects every attestation, so read this first.

| Key (env var) | Role | Goes on-chain as | Needs testnet funds? |
|---|---|---|---|
| `BACKEND_ATTESTATION_SIGNING_KEY` | ADR-001 trust root — the backend signs attestations with it | its **public half** is baked into each registry (`backendSigner` / `init`) | **No** — never deployed, never funded |
| `SEPOLIA_DEPLOYER_KEY` | pays gas to deploy the Sepolia Registry | nothing (just the sender) | **Yes** — Sepolia ETH |
| `SOROBAN_TESTNET_SECRET` | source account that deploys + initializes the Soroban contract | nothing (just the sender) | **Yes** — testnet XLM |

**The correctness link:** each registry stores the *public half* of `BACKEND_ATTESTATION_SIGNING_KEY`. The running backend later signs attestations with the *private half* of the **same** key (see `lib/chains/signing.ts`). If the value baked in at deploy time is derived from a different key than the one the deployed app runs with, `submitAttestation` fails with `InvalidSignature` on **every** call. Use the exact same `BACKEND_ATTESTATION_SIGNING_KEY` value for the deploy derivation below and for the app's runtime env.

The deployer/source keys (`SEPOLIA_DEPLOYER_KEY`, `SOROBAN_TESTNET_SECRET`) are ordinary funded testnet accounts and SHOULD be different from the trust-root key.

---

## 1. Sepolia (EVM) registry — Hardhat

`contracts/evm` is an isolated Hardhat v2 project (Solidity 0.8.24, `hardhat-ethers` v6, OpenZeppelin v5). It currently has **no network config and no deploy script** by design (Phase 6 was author + local-test only) — steps 1.2 and 1.3 add them.

### 1.1 Prerequisites

- `SEPOLIA_RPC_URL` (Alchemy/Infura free tier) and `SEPOLIA_DEPLOYER_KEY` (a funded Sepolia account) set in the repo-root `.env.local`. Fund the deployer from any Sepolia faucet.
- `BACKEND_ATTESTATION_SIGNING_KEY` set in `.env.local` (the same value the app will run with).
- Install deps (adds `dotenv` for loading the repo-root env at deploy time):

```bash
cd contracts/evm
npm install
npm install --save-dev dotenv
```

### 1.2 Add the Sepolia network to `contracts/evm/hardhat.config.js`

Replace the file body with the following. It loads the repo-root `.env.local` (so secrets stay out of shell history) and only registers the `sepolia` network when both vars are present, preserving the local-only default.

```js
// NIVAAN EVM registry — Hardhat config (isolated package; docs/architecture.md §9, §12).
require('@nomicfoundation/hardhat-ethers');
// Load the repo-root .env.local so SEPOLIA_* / BACKEND_* are available to the deploy.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const { SEPOLIA_RPC_URL, SEPOLIA_DEPLOYER_KEY } = process.env;
const sepoliaAccounts = SEPOLIA_DEPLOYER_KEY
  ? [SEPOLIA_DEPLOYER_KEY.startsWith('0x') ? SEPOLIA_DEPLOYER_KEY : `0x${SEPOLIA_DEPLOYER_KEY}`]
  : [];

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  networks: {
    // Registered only when configured — keeps `npx hardhat test` local-only otherwise.
    ...(SEPOLIA_RPC_URL && sepoliaAccounts.length
      ? { sepolia: { url: SEPOLIA_RPC_URL, accounts: sepoliaAccounts } }
      : {}),
  },
};
```

### 1.3 Create `contracts/evm/scripts/deploy.js`

```js
// Deploy the NIVAAN Sepolia Registry (docs/deployment.md; architecture.md §9, §12).
// The constructor bakes in the BACKEND attestation signer ADDRESS (ADR-001 root of
// trust) derived from BACKEND_ATTESTATION_SIGNING_KEY — NOT the deployer key. The
// deployer key (SEPOLIA_DEPLOYER_KEY, in hardhat.config.js) only pays gas.
const hre = require('hardhat');

async function main() {
  const raw = (process.env.BACKEND_ATTESTATION_SIGNING_KEY || '').trim();
  if (!raw) throw new Error('BACKEND_ATTESTATION_SIGNING_KEY is not set');
  const backendKey = raw.startsWith('0x') ? raw : `0x${raw}`;

  // The address the contract stores as `backendSigner`. Must match the key the
  // backend signs attestations with, or every submitAttestation reverts InvalidSignature.
  const backendSigner = new hre.ethers.Wallet(backendKey).address;
  console.log('Backend attestation signer (constructor arg):', backendSigner);

  const Registry = await hre.ethers.getContractFactory('Registry');
  const registry = await Registry.deploy(backendSigner);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log('Registry deployed to:', address);
  console.log(`→ set SEPOLIA_REGISTRY_ADDRESS=${address} in .env.local`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

### 1.4 Deploy, capture, verify

```bash
# from contracts/evm
npx hardhat run --network sepolia scripts/deploy.js
```

Copy the printed `Registry deployed to: 0x...` into the repo-root `.env.local`:

```
SEPOLIA_REGISTRY_ADDRESS=0x...
```

Sanity-check that the on-chain signer matches your backend key (independent derivation, from `contracts/evm` where `ethers` is installed):

```bash
node -e "const {ethers}=require('ethers');const k=process.env.BACKEND_ATTESTATION_SIGNING_KEY.trim();console.log(new ethers.Wallet(k.startsWith('0x')?k:'0x'+k).address)"
```

That address must equal the `backendSigner` the deploy logged. (You can also read it back on-chain: the contract exposes a public `backendSigner`.)

---

## 2. Soroban registry — Stellar CLI

`contracts/soroban` is a Rust crate (`nivaan-soroban-registry`, soroban-sdk v25) with an explicit one-time `init(backend_pubkey: BytesN<65>)` — so the flow is **build → deploy → invoke `init`**, not a constructor arg.

### 2.1 Prerequisites

- Rust toolchain + wasm target: `rustup target add wasm32-unknown-unknown`.
- Stellar CLI installed (`stellar --version`).
- A funded testnet source account. Either fund your existing `SOROBAN_TESTNET_SECRET` account via Friendbot, or generate a funded identity:

```bash
# Option A — generate + fund a fresh testnet identity, then read its secret into .env.local
stellar keys generate --network testnet --fund nivaan-deployer
stellar keys show nivaan-deployer          # → the S... secret; set SOROBAN_TESTNET_SECRET to it

# Option B — fund an account you already hold the secret for (needs its G... public address)
curl "https://friendbot.stellar.org/?addr=<G...public-address>"
```

- `SOROBAN_RPC_URL` and `SOROBAN_TESTNET_SECRET` set in `.env.local`. The testnet network passphrase is `Test SDF Network ; September 2015` (this is what the adapter's `Networks.TESTNET` resolves to).

Export the env for the CLI commands below (run from the repo root, or `source` your `.env.local`):

```bash
export $(grep -E '^(SOROBAN_RPC_URL|SOROBAN_TESTNET_SECRET|BACKEND_ATTESTATION_SIGNING_KEY)=' .env.local | xargs)
PASSPHRASE="Test SDF Network ; September 2015"
```

### 2.2 Build

```bash
cd contracts/soroban
stellar contract build
```

Note the `.wasm` path the CLI prints (typically `target/wasm32-unknown-unknown/release/nivaan_soroban_registry.wasm`; newer CLIs may use `target/wasm32v1-none/release/...`). Optionally shrink it:

```bash
stellar contract optimize --wasm target/wasm32-unknown-unknown/release/nivaan_soroban_registry.wasm
```

### 2.3 Deploy

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/nivaan_soroban_registry.wasm \
  --source-account "$SOROBAN_TESTNET_SECRET" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$PASSPHRASE"
```

This prints the contract id `C...`. Set it in `.env.local`:

```
SOROBAN_REGISTRY_CONTRACT_ID=C...
```

### 2.4 Initialize with the backend public key

Derive the **65-byte uncompressed** secp256k1 public key (`04 ‖ X32 ‖ Y32`) from the trust-root key, using the project's own `@noble/curves` so it matches exactly what the adapter recovers against (run from the repo root):

```bash
node --input-type=module -e '
import { secp256k1 } from "@noble/curves/secp256k1.js";
const k = (process.env.BACKEND_ATTESTATION_SIGNING_KEY || "").trim().replace(/^0x/i, "");
const pub = secp256k1.getPublicKey(Uint8Array.from(Buffer.from(k, "hex")), false);
console.log(Buffer.from(pub).toString("hex"));
'
```

That prints 130 hex characters. Pass it to `init` (the `BytesN<65>` arg takes a hex string):

```bash
stellar contract invoke \
  --id "$SOROBAN_REGISTRY_CONTRACT_ID" \
  --source-account "$SOROBAN_TESTNET_SECRET" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$PASSPHRASE" \
  -- init --backend_pubkey <paste-the-130-hex-chars>
```

`init` is one-time — a second call returns `AlreadyInitialized` (error #1). Verify the stored key round-trips:

```bash
stellar contract invoke \
  --id "$SOROBAN_REGISTRY_CONTRACT_ID" \
  --source-account "$SOROBAN_TESTNET_SECRET" \
  --rpc-url "$SOROBAN_RPC_URL" \
  --network-passphrase "$PASSPHRASE" \
  -- backend_key
```

The returned hex must equal the 130-char value you derived above.

---

## 3. After both deploys — wire and confirm

1. Confirm `.env.local` now has both addresses populated (names-only check — never print the values):

   ```bash
   grep -E '^(SOROBAN_REGISTRY_CONTRACT_ID|SEPOLIA_REGISTRY_ADDRESS)=' .env.local
   ```

2. With `SOROBAN_RPC_URL` + `SOROBAN_TESTNET_SECRET` + `SOROBAN_REGISTRY_CONTRACT_ID` (Soroban) and `SEPOLIA_RPC_URL` + `SEPOLIA_DEPLOYER_KEY` + `SEPOLIA_REGISTRY_ADDRESS` (Sepolia) all set, the chain adapters stop throwing `ChainAdapterNotConfiguredError` and go live — `submitAttestation` / `getResult` in `lib/chains/evm.ts` and `lib/chains/soroban.ts` will broadcast and read against the deployed registries.

3. Run the Phase 6 acceptance from `docs/roadmap.md`: a backend-signed attestation is accepted by both contracts, and a badly-signed one is rejected by both (the negative test proves the signature check, not just the happy path). The contracts' own suites already prove this locally (`hardhat test`, `cargo test`); this step confirms it end-to-end on testnet.

4. Record both addresses in the `docs/roadmap.md` testnet-deployment checklist.

**If `submitAttestation` reverts `InvalidSignature` for a signature that verifies in the unit tests:** the on-chain key doesn't match the running backend key. Re-derive from §1.4 / §2.4 using the app's actual `BACKEND_ATTESTATION_SIGNING_KEY` and redeploy/re-init.

---

## 4. Redeploy triggers

Redeploy both registries (and re-init Soroban) if any of these change, because the signed-digest layout is frozen across three files that must stay in lockstep (`lib/chains/attestation.ts`, `Registry.sol`, `lib.rs`):

- The attestation encoding, chain tags, `MAX_AGE_SECONDS` (300), or signature byte layout.
- The `BACKEND_ATTESTATION_SIGNING_KEY` (rotation) — the baked-in public key would no longer match.

There is no upgrade path for the immutable `backendSigner` (EVM) or the one-time `init` (Soroban) by design — a key rotation means a fresh deploy with the new public key, then updating `SEPOLIA_REGISTRY_ADDRESS` / `SOROBAN_REGISTRY_CONTRACT_ID`.
