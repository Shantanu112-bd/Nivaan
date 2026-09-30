"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Animate, PageContainer, WorkflowSteps } from '../components/Shared';

interface VerificationResult {
  verificationId: string;
  chain: 'soroban' | 'sepolia';
  result: boolean;
  verifiedAt: string;
}

function ResultContent() {
  const searchParams = useSearchParams();
  const vid = searchParams.get('vid');
  const [resultData, setResultData] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!vid) {
      setLoading(false);
      setErrorMsg('No verification ID provided.');
      return;
    }

    let intervalId: any;
    const fetchResult = async () => {
      try {
        const res = await fetch(`/api/verify/${vid}/result`);
        if (res.ok) {
          const data = await res.json();
          setResultData(data);
          setLoading(false);
          clearInterval(intervalId);
        } else if (res.status === 404) {
          // Keep polling if still processing
        } else {
          const err = await res.json();
          setErrorMsg(err.error || 'Failed to fetch verification result');
          setLoading(false);
          clearInterval(intervalId);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Error checking verification status');
        setLoading(false);
        clearInterval(intervalId);
      }
    };

    fetchResult();
    intervalId = setInterval(fetchResult, 1500);

    return () => clearInterval(intervalId);
  }, [vid]);

  const copyVid = () => {
    if (vid) {
      navigator.clipboard.writeText(vid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const chainName = resultData?.chain === 'soroban' ? 'Stellar Soroban' : 'Ethereum Sepolia';
  const isPass = resultData?.result === true;

  return (
    <div className="w-full max-w-[680px] flex flex-col items-center justify-center">
      {/* Workflow Navigation */}
      <WorkflowSteps currentStep="result" />

      <Animate delay={200} direction="up" className="w-full text-center mb-8">
        {loading ? (
          <div className="py-12">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-white/[0.08]" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white border-r-indigo-400 animate-spin" />
              <div className="absolute inset-3 rounded-full bg-white/[0.02] backdrop-blur-sm flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-indigo-400 animate-ping" />
              </div>
            </div>
            <h1 className="text-white text-[26px] sm:text-[34px] font-normal tracking-[-0.02em] mb-2">
              Finalizing On-Chain Attestation
            </h1>
            <p className="text-white/60 text-[14px] sm:text-[15px] font-[450] max-w-[420px] mx-auto">
              Listening for cross-chain registry confirmation and cryptographic finality...
            </p>
          </div>
        ) : errorMsg ? (
          <div className="py-8">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/30">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
            </div>
            <h1 className="text-white text-[28px] sm:text-[38px] font-normal leading-[1.1] mb-3">
              Verification Failed
            </h1>
            <p className="text-rose-300 text-[15px] max-w-[420px] mx-auto mb-8 font-[450]">
              {errorMsg}
            </p>
            <Link
              href="/wallet"
              className="nivaan-btn-secondary h-[46px] px-6 rounded-[14px] text-[14px]"
            >
              Return to Wallet
            </Link>
          </div>
        ) : (
          <>
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className={`absolute inset-0 ${isPass ? 'bg-emerald-500/25' : 'bg-rose-500/25'} rounded-full blur-2xl animate-pulse`} />
              <div className={`relative w-20 h-20 ${isPass ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/15 border-rose-500/30 text-rose-400'} rounded-full flex items-center justify-center border shadow-[0_0_30px_rgba(16,185,129,0.2)]`}>
                {isPass ? (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ) : (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                )}
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] mb-4">
              <span className={`w-2 h-2 rounded-full ${isPass ? 'bg-emerald-400 shadow-[0_0_8px_#34D399]' : 'bg-rose-400'}`} />
              <span className="text-white/70 text-[12px] uppercase font-mono tracking-wider">
                {isPass ? 'Zero-Knowledge Attestation Confirmed' : 'Attestation Rejected'}
              </span>
            </div>

            <h1 className="text-white text-[32px] sm:text-[44px] font-normal leading-[1.1] tracking-[-0.02em] mb-3">
              {isPass ? 'Proof Attested On-Chain' : 'Verification Denied'}
            </h1>
            <p className="text-white/75 text-[15px] sm:text-[17px] font-[450] leading-[1.5] max-w-[460px] mx-auto">
              {isPass
                ? `Your anonymous compliance credential has been cryptographically confirmed and anchored on ${chainName}.`
                : 'The presented proof failed on-chain circuit constraints or expired.'}
            </p>
          </>
        )}
      </Animate>

      {!loading && !errorMsg && resultData && (
        <Animate delay={400} direction="up" className="w-full">
          <div className="nivaan-glass-card p-6 sm:p-9 relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-white/90 uppercase tracking-wider">
                  Attestation Summary
                </span>
              </div>
              <span className="text-white/40 text-[12px] font-mono">
                {new Date(resultData.verifiedAt).toLocaleDateString()}
              </span>
            </div>

            <div className="space-y-4 mb-8">
              {/* Target Chain */}
              <div className="flex items-center justify-between p-3.5 rounded-[14px] bg-white/[0.02] border border-white/[0.05]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-[10px] bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white/80">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white/50 text-[11px] uppercase tracking-wider font-mono">Registry Network</div>
                    <div className="text-white text-[14px] font-medium">{chainName}</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] font-medium">
                  Public Testnet
                </span>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between p-3.5 rounded-[14px] bg-white/[0.02] border border-white/[0.05]">
                <div>
                  <div className="text-white/50 text-[11px] uppercase tracking-wider font-mono">Cryptographic Status</div>
                  <div className="text-white text-[14px] font-medium">Compliance Assertion</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isPass ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-400'}`} />
                  <span className={`text-[13px] font-semibold ${isPass ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPass ? 'Valid (Tier 1 Passed)' : 'Invalid Proof'}
                  </span>
                </div>
              </div>

              {/* Verification Handle */}
              {vid && (
                <div className="p-3.5 rounded-[14px] bg-white/[0.02] border border-white/[0.05]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white/50 text-[11px] uppercase tracking-wider font-mono">Verification Handle</span>
                    <button
                      onClick={copyVid}
                      className="text-white/50 hover:text-white text-[11px] font-mono flex items-center gap-1 transition-colors"
                    >
                      {copied ? '✓ Copied' : 'Copy ID'}
                    </button>
                  </div>
                  <div className="font-mono text-[12px] text-white/80 bg-black/40 px-3 py-2 rounded-[8px] border border-white/[0.06] truncate">
                    {vid}
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <div className="flex items-center justify-between p-3.5 rounded-[14px] bg-white/[0.02] border border-white/[0.05]">
                <div>
                  <div className="text-white/50 text-[11px] uppercase tracking-wider font-mono">Attested Timestamp</div>
                  <div className="text-white/90 text-[13px] font-mono">
                    {new Date(resultData.verifiedAt).toLocaleTimeString()} UTC
                  </div>
                </div>
                <span className="text-white/40 text-[12px] font-mono">0 Bytes PII</span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center mt-2">
              <Link
                href={`/demo-verifier?vid=${resultData.verificationId}`}
                className="nivaan-btn-secondary h-[48px] sm:h-[52px] px-6 rounded-[14px] text-[14px] sm:text-[15px] w-full sm:w-auto"
              >
                <span>View on Partner Portal</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </Link>
              <Link
                href="/wallet"
                className="nivaan-btn-primary h-[48px] sm:h-[52px] px-7 rounded-[14px] text-[14px] sm:text-[15px] w-full sm:w-auto"
              >
                Return to Wallet
              </Link>
            </div>
          </div>
        </Animate>
      )}
    </div>
  );
}

export default function Result() {
  return (
    <PageContainer isLoggedIn={true} showVideo={false}>
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white animate-spin mb-4" />
          <p className="text-white/60 text-[14px]">Loading verification result...</p>
        </div>
      }>
        <ResultContent />
      </Suspense>
    </PageContainer>
  );
}

