"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Animate, PageContainer, WorkflowSteps } from '../components/Shared';
import { ShieldCheck, ArrowRight, Lock, Key, Award, ExternalLink } from 'lucide-react';

interface CredentialStatus {
  credentialId: string;
  status: 'active' | 'expired' | 'revoked';
  expiresAt: string;
}

export default function Wallet() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  const [credStatus, setCredStatus] = useState<CredentialStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => {
        if (res.ok) setIsLoggedIn(true);
      })
      .catch(() => {});

    const storedId = localStorage.getItem('nivaan_credential_id');
    const storedIssuedAt = localStorage.getItem('nivaan_credential_issued_at');
    setCredentialId(storedId);
    setIssuedAt(storedIssuedAt);

    if (storedId) {
      fetch(`/api/credentials/${storedId}/status`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data) setCredStatus(data);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const statusLabel = credStatus?.status || 'active';
  const statusColor = {
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    expired: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    revoked: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  }[statusLabel];

  return (
    <PageContainer isLoggedIn={isLoggedIn} showVideo={false}>
      <div className="w-full max-w-[1080px] flex flex-col">
        <WorkflowSteps currentStep="wallet" />

        <Animate delay={200} direction="up" className="w-full mb-8 sm:mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] px-3.5 py-1.5 rounded-full mb-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/80 text-[12.5px] font-[450] tracking-wide uppercase">Decentralized Identifier Wallet</span>
          </div>
          <h1 className="text-white text-[34px] sm:text-[50px] font-normal leading-[1.05] tracking-[-0.02em] mb-3">
            Credential Wallet
          </h1>
          <p className="text-white/70 text-[16px] sm:text-[18px] font-[450] leading-[1.4] max-w-[500px]">
            Manage zero-knowledge credentials issued on Midnight and prepare them for cross-chain proof generation.
          </p>
        </Animate>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-stretch">
          {/* Main Credential Card */}
          <div className="lg:col-span-7 flex flex-col">
            <Animate delay={400} direction="scale" className="h-full flex flex-col">
              <div className="w-full rounded-[28px] sm:rounded-[36px] nivaan-glass-card p-6 sm:p-9 relative overflow-hidden flex flex-col justify-between flex-1 min-h-[440px]">
                {/* Holographic glowing edge */}
                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-indigo-500 via-emerald-400 to-cyan-500" />
                
                {credentialId ? (
                  <>
                    <div>
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-[16px] bg-white/[0.06] border border-white/10 flex items-center justify-center">
                            <Award className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="text-white/50 text-[12px] uppercase tracking-wider font-[450]">Verified Identity</p>
                            <h2 className="text-white text-[22px] sm:text-[24px] font-medium tracking-tight">Tier-1 Compliance</h2>
                          </div>
                        </div>

                        <span className={`px-3 py-1 rounded-full text-[12px] font-medium border capitalize flex items-center gap-1.5 ${statusColor}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          <span>{statusLabel}</span>
                        </span>
                      </div>

                      <div className="p-3.5 rounded-[16px] bg-black/30 border border-white/[0.06] mb-6">
                        <p className="text-white/40 text-[11px] font-mono uppercase tracking-wider mb-1">Credential Handle</p>
                        <p className="text-white/80 text-[13px] font-mono break-all">{credentialId}</p>
                      </div>

                      <div className="space-y-3.5 mb-8">
                        <div className="flex justify-between items-center py-2 border-b border-white/[0.06]">
                          <span className="text-white/50 text-[13.5px]">Issuing Network</span>
                          <span className="text-white/90 text-[13.5px] font-[450] flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-400" />
                            <span>Midnight Preview</span>
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/[0.06]">
                          <span className="text-white/50 text-[13.5px]">Issuance Date</span>
                          <span className="text-white/90 text-[13.5px] font-mono">{formatDate(issuedAt)}</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                          <span className="text-white/50 text-[13.5px]">Validity Expiry</span>
                          <span className="text-white/90 text-[13.5px] font-mono">{formatDate(credStatus?.expiresAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <Link
                        href="/consent"
                        className="w-full nivaan-btn-primary h-[48px] sm:h-[52px] rounded-[14px] text-[14.5px] sm:text-[15px]"
                      >
                        <span>Generate Proof for Target Network</span>
                        <ArrowRight className="w-4 h-4 text-[#070A18]" />
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center my-auto">
                    <div className="w-16 h-16 rounded-[20px] bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4">
                      <Lock className="w-7 h-7 text-white/40" />
                    </div>
                    <p className="text-white text-[18px] font-medium mb-1">No Active Credentials</p>
                    <p className="text-white/50 text-[14px] max-w-[300px] mb-6">
                      Scan your Aadhaar Test QR to issue your initial zero-knowledge identity pass.
                    </p>
                    <Link
                      href="/onboarding"
                      className="nivaan-btn-primary h-[46px] px-7 rounded-[13px] text-[14px]"
                    >
                      <span>Issue Credential</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#070A18]" />
                    </Link>
                  </div>
                )}
              </div>
            </Animate>
          </div>

          {/* Stats & Specification Card (Matching Landing Page ZKStatsCard) */}
          <div className="lg:col-span-5 flex flex-col">
            <Animate delay={500} direction="scale" className="h-full flex flex-col">
              <div className="w-full rounded-[28px] sm:rounded-[36px] nivaan-glass-card p-6 sm:p-8 flex flex-col justify-between flex-1 min-h-[440px]">
                <div>
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/[0.08]">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-white text-[17px] font-medium">Protocol Guarantees</h3>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <p className="text-white text-[28px] sm:text-[34px] font-[450] leading-none mb-1">
                        0 bytes
                      </p>
                      <p className="text-white/50 text-[12.5px] uppercase tracking-wider font-[450]">
                        Raw Data Retained
                      </p>
                      <p className="text-white/60 text-[13px] mt-1 leading-[1.4]">
                        Private identity data stays in local witness state and is never transmitted.
                      </p>
                    </div>

                    <div className="w-full h-px bg-white/[0.08]" />

                    <div>
                      <p className="text-white text-[28px] sm:text-[34px] font-[450] leading-none mb-1">
                        2 Chains
                      </p>
                      <p className="text-white/50 text-[12.5px] uppercase tracking-wider font-[450]">
                        Live Cross-Chain Registries
                      </p>
                      <p className="text-white/60 text-[13px] mt-1 leading-[1.4]">
                        Attestations verify on Ethereum Sepolia and Stellar Soroban.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/[0.08]">
                  <Link
                    href="/demo-verifier"
                    className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-[13px] font-[450] transition-colors"
                  >
                    <span>Test in 3rd-Party Verifier Portal</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </Animate>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
