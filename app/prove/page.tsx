"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Animate, PageContainer, WorkflowSteps } from '../components/Shared';
import { Cpu, ShieldCheck, Check, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';

const CONSENT_TEXT_V1 = "I consent to NIVAAN generating a zero-knowledge proof of my KYC compliance status for the selected chain. No identity documents or personal data are shared; only a pass/fail result is disclosed.";

async function getOrComputeConsentHash(): Promise<string> {
  const existing = sessionStorage.getItem('nivaan_consent_hash');
  if (existing) return existing;
  const bytes = new TextEncoder().encode(CONSENT_TEXT_V1);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem('nivaan_consent_hash', hash);
  return hash;
}

export default function Prove() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<'soroban' | 'sepolia'>('soroban');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stepMsg, setStepMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => {
        if (res.ok) setIsLoggedIn(true);
      })
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    setErrorMsg('');
    setIsGenerating(true);

    try {
      const credentialId = localStorage.getItem('nivaan_credential_id');
      if (!credentialId) {
        throw new Error('No credential found. Please complete onboarding first.');
      }

      const consentHash = await getOrComputeConsentHash();

      // Step 1: Create proof request
      setStepMsg('Step 1/3: Creating zero-knowledge proof request...');
      const genRes = await fetch('/api/proofs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialId,
          targetChain: selectedNetwork,
          policyId: 'kyc_tier_1',
          consentHash,
        }),
      });

      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.error || `Failed to initiate proof (status ${genRes.status})`);
      }

      const { proofRequestId } = await genRes.json();

      // Step 2: Poll proof status
      setStepMsg('Step 2/3: Proving compliance circuit via Midnight...');
      let isReady = false;
      let attempts = 0;
      while (!isReady && attempts < 40) {
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
        const statusRes = await fetch(`/api/proofs/${proofRequestId}/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.status === 'ready') {
            isReady = true;
          } else if (statusData.status === 'failed') {
            throw new Error(statusData.failureReason || 'Proof generation failed');
          }
        }
      }

      // Step 3: Verify and attest on target chain
      setStepMsg(`Step 3/3: Submitting verified attestation to ${selectedNetwork === 'soroban' ? 'Stellar Soroban' : 'Ethereum Sepolia'}...`);
      const verifyRes = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofRequestId }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || `Verification failed (status ${verifyRes.status})`);
      }

      const { verificationId } = await verifyRes.json();
      router.push(`/result?vid=${verificationId}`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during proof generation');
      setIsGenerating(false);
    }
  };

  return (
    <PageContainer isLoggedIn={isLoggedIn} showVideo={false}>
      <div className="flex flex-col items-center justify-center max-w-[660px] mx-auto w-full">
        <WorkflowSteps currentStep="prove" />

        <Animate delay={200} direction="up" className="w-full text-center">
          <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] px-3.5 py-1.5 rounded-full mb-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-white/80 text-[12.5px] font-[450] tracking-wide uppercase">Halo2 Zero-Knowledge Proof Engine</span>
          </div>

          <h1 className="text-white text-[34px] sm:text-[48px] font-normal leading-[1.05] tracking-[-0.02em] mb-4">
            Generate Proof
          </h1>
          <p className="text-white/70 text-[15px] sm:text-[17px] font-[450] leading-[1.4] mb-8 max-w-[460px] mx-auto">
            Select a target network to attest your compliance status without exposing underlying identity data.
          </p>
        </Animate>

        <Animate delay={400} direction="scale" className="w-full">
          <div className="w-full rounded-[28px] sm:rounded-[36px] nivaan-glass-card p-6 sm:p-10 relative overflow-hidden">
            {/* Top ambient highlight */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[340px] h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-8">
                {/* ZK Radar graphic */}
                <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-white/10 animate-ping opacity-25" />
                  <div className="absolute inset-2 rounded-full border-2 border-indigo-500/20 border-t-indigo-400 animate-spin" />
                  <div className="absolute inset-4 rounded-full border border-emerald-400/30 animate-pulse" />
                  <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                  </div>
                </div>

                <p className="text-white text-[22px] font-medium mb-2 tracking-tight">Generating Zero-Knowledge Proof</p>
                <div className="px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 mb-6">
                  <p className="text-emerald-400 font-mono text-[13px]">{stepMsg}</p>
                </div>

                <div className="w-full max-w-[340px] space-y-2">
                  <div className="flex justify-between text-[11px] text-white/50 uppercase tracking-wider">
                    <span>Circuit Prover</span>
                    <span>Midnight Halo2</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 via-emerald-400 to-cyan-400 w-full animate-pulse" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <p className="text-white/60 text-[12px] uppercase tracking-wider font-[450] mb-3 text-left">
                    Target Attestation Network
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    {/* Soroban Card */}
                    <button 
                      onClick={() => setSelectedNetwork('soroban')}
                      className={`relative flex flex-col items-start p-4 sm:p-5 rounded-[20px] border transition-all text-left group ${
                        selectedNetwork === 'soroban' 
                          ? 'bg-white/[0.08] border-white/40 shadow-[0_0_25px_rgba(255,255,255,0.08)]' 
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-3">
                        <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="9"/>
                            <path d="M12 3a9 9 0 0 0 0 18M3 12h18"/>
                          </svg>
                        </div>
                        {selectedNetwork === 'soroban' && (
                          <div className="w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center text-black">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <span className="text-white font-medium text-[16px] block">Stellar Soroban</span>
                      <span className="text-white/40 text-[12px] mt-0.5">Wasm Smart Contracts</span>
                    </button>

                    {/* Sepolia Card */}
                    <button 
                      onClick={() => setSelectedNetwork('sepolia')}
                      className={`relative flex flex-col items-start p-4 sm:p-5 rounded-[20px] border transition-all text-left group ${
                        selectedNetwork === 'sepolia' 
                          ? 'bg-white/[0.08] border-white/40 shadow-[0_0_25px_rgba(255,255,255,0.08)]' 
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-3">
                        <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2L4 12l8 5 8-5L12 2z"/>
                            <path d="M4 12l8 10 8-10"/>
                          </svg>
                        </div>
                        {selectedNetwork === 'sepolia' && (
                          <div className="w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center text-black">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <span className="text-white font-medium text-[16px] block">Ethereum Sepolia</span>
                      <span className="text-white/40 text-[12px] mt-0.5">EVM Testnet Registry</span>
                    </button>
                  </div>
                </div>
                
                <div className="p-4 rounded-[18px] bg-black/30 border border-white/[0.08] mb-8 space-y-2.5">
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-white/50">Policy Definition</span>
                    <span className="text-white font-mono bg-white/[0.06] px-2 py-0.5 rounded border border-white/10">kyc_tier_1</span>
                  </div>
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-white/50">Proved Constraints</span>
                    <span className="text-white/90 font-[450]">Age &ge; 18, Jurisdiction: IN</span>
                  </div>
                </div>

                {errorMsg && (
                  <div className="mb-6 p-3.5 rounded-[14px] bg-red-500/10 border border-red-500/30 text-red-300 text-[13.5px] flex items-center gap-2 text-left">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                  <Link
                    href="/wallet"
                    className="flex items-center justify-center h-[48px] sm:h-[52px] px-[22px] sm:px-[28px] rounded-[14px] border border-white/20 bg-white/[0.03] text-white/80 text-[14px] sm:text-[15px] font-[450] transition-all hover:bg-white/10 hover:text-white hover:border-white/30"
                  >
                    Cancel
                  </Link>
                  <button 
                    onClick={handleGenerate}
                    className="flex items-center justify-center gap-2 h-[48px] sm:h-[52px] px-[26px] sm:px-[32px] bg-[#E9E9E9] rounded-[14px] text-[#0A0707] text-[14px] sm:text-[15px] font-[450] transition-all hover:bg-white hover:shadow-[0_0_25px_rgba(255,255,255,0.25)]"
                  >
                    <span>Generate Proof</span>
                    <ArrowRight className="w-4 h-4 text-black/70" />
                  </button>
                </div>
              </>
            )}
          </div>
        </Animate>
      </div>
    </PageContainer>
  );
}
