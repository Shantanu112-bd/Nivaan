"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Animate, PageContainer } from '../components/Shared';

interface VerifierResult {
  verificationId: string;
  chain: 'soroban' | 'sepolia';
  result: boolean;
  verifiedAt: string;
}

function DemoVerifierContent() {
  const searchParams = useSearchParams();
  const vid = searchParams.get('vid');
  const [result, setResult] = useState<VerifierResult | null>(null);
  const [logs, setLogs] = useState<string[]>([
    '> Initializing 3rd-party Verifier Gateway...',
    '> Connecting to NIVAAN Server-Side Verification Proxy...',
  ]);

  useEffect(() => {
    if (!vid) {
      setLogs(prev => [
        ...prev,
        '> Listening for incoming verification ID (vid param)...',
        '> Awaiting user to complete proof flow in wallet...',
      ]);
      return;
    }

    setLogs(prev => [
      ...prev,
      `> Received verification handle: ${vid}`,
      '> Querying cross-chain registry via server-side verification proxy...',
    ]);

    let intervalId: any;
    const poll = async () => {
      try {
        const res = await fetch(`/api/demo-verifier/${vid}/result`);
        if (res.ok) {
          const data: VerifierResult = await res.json();
          setResult(data);
          setLogs(prev => [
            ...prev,
            `> Attestation confirmed on ${data.chain.toUpperCase()}!`,
            `> Cryptographic validity: ${data.result ? 'PASS (Compliance verified)' : 'FAIL'}`,
            `> Verification timestamp: ${new Date(data.verifiedAt).toISOString()}`,
            `> Access decision: ${data.result ? 'GRANTED' : 'DENIED'}`,
          ]);
          clearInterval(intervalId);
        } else if (res.status === 404) {
          setLogs(prev => [...prev.slice(-10), '> Awaiting on-chain transaction finalization...']);
        } else {
          setLogs(prev => [...prev, `> Error checking verification: HTTP ${res.status}`]);
          clearInterval(intervalId);
        }
      } catch (err: any) {
        setLogs(prev => [...prev, `> Network query failed: ${err.message}`]);
        clearInterval(intervalId);
      }
    };

    poll();
    intervalId = setInterval(poll, 2000);
    return () => clearInterval(intervalId);
  }, [vid]);

  const chainDisplay = result?.chain === 'soroban' ? 'Stellar Soroban' : 'Ethereum Sepolia';

  return (
    <div className="flex flex-col items-center justify-center max-w-[920px] mx-auto w-full">
      <Animate delay={200} direction="up" className="w-full text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] px-4 py-1.5 rounded-full mb-5 shadow-sm">
          <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          <span className="text-white/80 text-[12px] font-mono tracking-wider uppercase">
            Enterprise Relying Party • Verifier Gateway
          </span>
        </div>
        <h1 className="text-white text-[32px] sm:text-[46px] font-normal leading-[1.1] tracking-[-0.02em] mb-3">
          Age Restricted Content Gateway
        </h1>
        <p className="text-white/70 text-[15px] sm:text-[17px] font-[450] leading-[1.5] max-w-[540px] mx-auto">
          Demonstrates how external applications verify compliance status via zero-knowledge attestations with <span className="text-white font-medium">zero personal data disclosed</span>.
        </p>
      </Animate>

      <Animate delay={400} direction="up" className="w-full">
        <div className="nivaan-glass-card p-6 sm:p-10 relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Verification Status & Decision */}
            <div className="lg:col-span-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-5">
                  <span className="text-white/90 text-[13px] font-semibold uppercase tracking-wider">
                    Access Gate
                  </span>
                  <span className="text-white/40 text-[11px] font-mono uppercase">
                    Protocol v1
                  </span>
                </div>

                {!result ? (
                  <div className="py-6 flex flex-col items-center text-center">
                    <div className="relative w-16 h-16 mb-5">
                      <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white border-r-indigo-400 animate-spin" />
                      <div className="absolute inset-2 rounded-full bg-white/[0.02] flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
                      </div>
                    </div>
                    <h3 className="text-white text-[18px] font-medium mb-1">Awaiting Proof</h3>
                    <p className="text-white/50 text-[13px] font-[450] max-w-[240px]">
                      Listening for on-chain attestation broadcast from wallet...
                    </p>
                  </div>
                ) : result.result ? (
                  <div className="py-4 flex flex-col items-center text-center">
                    <div className="relative w-16 h-16 mb-4">
                      <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                      <div className="relative w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center border border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] font-medium mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Access Granted
                    </div>
                    <h3 className="text-white text-[20px] font-medium mb-1">Tier-1 Validated</h3>
                    <p className="text-white/50 text-[13px] font-[450] max-w-[240px] mb-6">
                      Cryptographically attested on {chainDisplay}
                    </p>
                    
                    <Link
                      href="/wallet"
                      className="w-full flex items-center justify-center h-[46px] px-6 bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[14px] font-[450] transition-all hover:bg-white hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                    >
                      Return to NIVAAN
                    </Link>
                  </div>
                ) : (
                  <div className="py-4 flex flex-col items-center text-center">
                    <div className="relative w-16 h-16 mb-4">
                      <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-xl animate-pulse" />
                      <div className="relative w-16 h-16 bg-rose-500/15 rounded-full flex items-center justify-center border border-rose-500/30 text-rose-400">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[12px] font-medium mb-2">
                      Access Denied
                    </div>
                    <h3 className="text-white text-[20px] font-medium mb-1">Requirement Failed</h3>
                    <p className="text-white/50 text-[13px] font-[450] max-w-[240px]">
                      Proof does not satisfy minimum age or jurisdiction constraints.
                    </p>
                  </div>
                )}
              </div>

              {/* Protocol Metrics */}
              <div className="mt-6 pt-5 border-t border-white/[0.06] space-y-2.5">
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-white/50 font-mono">PII Data Revealed:</span>
                  <span className="text-emerald-400 font-mono font-medium">0 Bytes</span>
                </div>
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-white/50 font-mono">Proof Scheme:</span>
                  <span className="text-white/80 font-mono">Halo2 zk-SNARK</span>
                </div>
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-white/50 font-mono">Verification Mode:</span>
                  <span className="text-white/80 font-mono">Direct Registry Query</span>
                </div>
              </div>
            </div>

            {/* Right Column: Live Audit Terminal */}
            <div className="lg:col-span-7 w-full">
              <div className="rounded-[18px] bg-[#0A0A0F]/80 border border-white/[0.08] overflow-hidden shadow-2xl">
                {/* Terminal Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    <span className="ml-2 font-mono text-[11px] text-white/50">
                      gateway-audit.log
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-mono text-white/40 uppercase">LIVE FEED</span>
                  </div>
                </div>

                {/* Terminal Body */}
                <div className="p-4 sm:p-5 font-mono text-[12px] leading-[1.7] text-white/70 h-[320px] overflow-y-auto space-y-1.5 scrollbar-thin">
                  {logs.map((line, i) => {
                    const isGranted = line.includes('GRANTED') || line.includes('PASS');
                    const isDenied = line.includes('DENIED') || line.includes('FAIL') || line.includes('Error');
                    const isConfirmed = line.includes('confirmed');
                    const isInit = line.includes('Initializing') || line.includes('Connecting');

                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-2 ${
                          isGranted
                            ? 'text-emerald-400 font-medium'
                            : isDenied
                            ? 'text-rose-400 font-medium'
                            : isConfirmed
                            ? 'text-indigo-300'
                            : isInit
                            ? 'text-white/40'
                            : 'text-white/75'
                        }`}
                      >
                        <span className="text-white/30 select-none">&gt;</span>
                        <span className="break-all">{line.replace(/^>\s*/, '')}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </div>
      </Animate>
    </div>
  );
}

export default function DemoVerifier() {
  return (
    <PageContainer isLoggedIn={false} showVideo={false}>
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white animate-spin mb-4" />
          <p className="text-white/60 text-[14px]">Loading verifier gateway...</p>
        </div>
      }>
        <DemoVerifierContent />
      </Suspense>
    </PageContainer>
  );
}

