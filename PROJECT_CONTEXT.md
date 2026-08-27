# Nivaan - Project Context

This file documents the **actual current state** of the Nivaan project as of the latest inspection. It serves as the persistent source of truth for the project's state, architecture, and completion status. When starting a new task, refer to this context before modifying the codebase.

## 1. Project Architecture and Folder Structure

The project strictly isolates responsibilities between the frontend (Antigravity) and the backend (Claude Code):
- `app/` (Frontend): Contains the Next.js App Router UI and page components (owned by Antigravity).
- `app/api/` (Backend): Contains all Next.js API route handlers exposing REST endpoints.
- `lib/` (Backend): Contains core logic, broken down into:
  - `lib/db/`: Prisma schema, configuration, and generated clients.
  - `lib/services/`: Core business logic (auth, credentials, proofs, verification).
  - `lib/config/`: Configuration rules (policies).
  - `lib/api/`: HTTP utilities and session management.
- `contracts/`: Smart contract logic for Midnight, EVM (Sepolia), and Soroban.
- `docs/`: Ground truth architecture, product specification, and API specifications.

## 2. Implementation Status

### What is Fully Implemented
- **Database Schema**: Fully implemented via Prisma (`lib/db/schema.prisma`). Includes tables for `AuthNonce`, `Credential`, `RevokedCredential`, `ConsentLog`, `ProofRequest`, and `VerificationResult`.
- **Backend Services (DB Layer)**: `authService`, `consentService`, `credentialService`, `proofService`, `revocationService`, and `verificationService` are fully implemented and interact with the database.
- **API Routes (REST Layer)**: Handlers under `app/api/` for authentication (`/auth/nonce`, `/auth/verify`), credential management (`/credentials/issue`, `/credentials/[id]/status`), proofs (`/proofs/generate`, `/proofs/[id]/status`), and verification (`/verify`, `/verify/[id]/result`) have been wired.
- **Frontend Components**: The landing page Hero component (`app/components/Hero.tsx`) and the main entry page (`app/page.tsx`) have been built exactingly to the Apogee reference UI, featuring a dynamic navigation bar, stats card, and responsive layout.

### What is Partially Implemented
- **Midnight Integration**: The backend services and API routes are written, but the actual Minokawa ZK circuit evaluation and Midnight toolchain integration are currently blocked/stubbed.
- **Frontend Routing**: Navigation links point to `/onboarding`, `/prove`, and `/wallet`, but these destination pages are structurally empty and pending implementation.

### What is Not Implemented
- **Wallet Connection UI & Flow**: The frontend onboarding flow for Aadhaar QR scanning and wallet signature login (`/onboarding`) is missing.
- **Credential Dashboard**: The UI for users to view and manage their compliance credentials (`/wallet`) is missing.
- **Prove Flow**: The UI for initiating ZK proof generation (`/prove`) is missing.
- **Verifier Demo**: The surface for integrating third-party chain verification logic is not built.

## 3. Core Flows (Current State)

### Authentication and Wallet Flow
- **Backend**: Implemented. Relies on issuing a cryptographic nonce (`GET /api/auth/nonce`), having the user's wallet sign it, and verifying the signature (`POST /api/auth/verify`), storing the session locally. 
- **Frontend**: Not yet wired to the backend. The UI only provides placeholder navigation to the future `/onboarding` path.

### Credential / KYC Flow
- **Backend**: Service layer logic for issuing credentials and logging consent is fully written and connected to Prisma. The actual KYC validation against India Stack/Aadhaar ZK proofs is currently mocked in the service layer due to pending toolchain integration.

### ZK Proof Generation and Verification
- **Backend**: Request models and status polling endpoints exist, but actual proof generation against Soroban/Sepolia relies on mocked implementations returning predetermined statuses (Pending -> Ready) in test scenarios.

## 4. Supported Chains & Config
- **Chains**: The platform targets Midnight (for state/issuance), and Soroban + EVM/Sepolia (for verifier targets).
- **Environment Variables**: Documented in `.env.example`. Requires configuration for Midnight RPC/Seed, Anon Aadhaar test keys, Soroban RPC/secret, Sepolia RPC/deployer key, and a strictly secret `BACKEND_ATTESTATION_SIGNING_KEY`.

## 5. Dependencies and Tooling
- **Framework**: Next.js 16.3.1 (App Router), React 19.
- **Styling**: Tailwind CSS v4, PostCSS, Lucide-React for icons.
- **Database**: Prisma ORM v7 with `@prisma/adapter-pg`.
- **Testing**: Vitest for backend/service testing.

## 6. Development Commands
- **Run the Dev Server**: `npm run dev`
- **Build the Application**: `npm run build`
- **Typecheck**: `npx tsc --noEmit`
- **Generate Prisma Client**: `npm run db:generate`
- **Run Tests**: `npm run test`
