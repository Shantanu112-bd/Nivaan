"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Animate, PageContainer, WorkflowSteps } from '../components/Shared';
import { Shield, Check, Lock, Globe, ArrowRight, Quote } from 'lucide-react';

const CONSENT_TEXT_V1 = "I consent to NIVAAN generating a zero-knowledge proof of my KYC compliance status for the selected chain. No identity documents or personal data are shared; only a pass/fail result is disclosed.";

export default function Consent() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => {
        if (res.ok) setIsLoggedIn(true);
      })
      .catch(() => {});
  }, []);

  const handleApprove = async () => {
    setLoading(true);
    try {
      const bytes = new TextEncoder().encode(CONSENT_TEXT_V1);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('nivaan_consent_hash', hash);
      router.push('/prove');
    } catch (err) {
      console.error('Failed to hash consent:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer isLoggedIn={isLoggedIn} showVideo={false}>
      <div className="flex flex-col items-center justify-center max-w-[640px] mx-auto w-full">
        <WorkflowSteps currentStep="consent" />

        <Animate delay={200} direction="up" className="w-full text-center">
          <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] px-3.5 py-1.5 rounded-full mb-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-white/80 text-[12.5px] font-[450] tracking-wide uppercase">Cryptographic Authorization</span>
          </div>

          <h1 className="text-white text-[34px] sm:text-[48px] font-normal leading-[1.05] tracking-[-0.02em] mb-4">
            Data Consent
          </h1>
          <p className="text-white/70 text-[15px] sm:text-[17px] font-[450] leading-[1.4] mb-8 max-w-[460px] mx-auto">
            Authorize NIVAAN to evaluate your compliance criteria without revealing identity documents.
          </p>
        </Animate>

        <Animate delay={400} direction="scale" className="w-full">
          <div className="w-full rounded-[28px] sm:rounded-[36px] nivaan-glass-card p-6 sm:p-10 relative overflow-hidden">
            {/* Top ambient highlight */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[320px] h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            <div className="flex flex-col gap-3.5 mb-6">
              <div className="p-4 rounded-[18px] bg-white/[0.03] border border-white/[0.08] flex justify-between items-center transition-all hover:bg-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Check className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-white text-[15px] font-medium block">Age Threshold Check</span>
                    <span className="text-white/40 text-[12px]">Asserts age &ge; 18 years without disclosing DOB</span>
                  </div>
                </div>
                <span className="text-emerald-400 text-[12px] bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full font-medium">
                  Disclosed Boolean
                </span>
              </div>

              <div className="p-4 rounded-[18px] bg-white/[0.03] border border-white/[0.08] flex justify-between items-center transition-all hover:bg-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Globe className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-white text-[15px] font-medium block">Jurisdiction Validity</span>
                    <span className="text-white/40 text-[12px]">India compliance tier (IN)</span>
                  </div>
                </div>
                <span className="text-emerald-400 text-[12px] bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full font-medium">
                  Verified Tier
                </span>
              </div>
            </div>

            {/* Official Legal Statement */}
            <div className="p-5 rounded-[20px] bg-black/40 border border-white/10 mb-8 relative">
              <div className="flex items-center gap-2 mb-2 text-white/50 text-[11px] font-mono uppercase tracking-wider">
                <Quote className="w-3.5 h-3.5 text-white/40" />
                <span>Versioned Consent Hash (v1)</span>
              </div>
              <p className="text-white/90 text-[13.5px] leading-[1.6] italic">
                "{CONSENT_TEXT_V1}"
              </p>
              <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-white/40">
                <span>Algorithm: SHA-256</span>
                <span>Storage: On-chain ConsentLog</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <Link
                href="/wallet"
                className="flex items-center justify-center h-[48px] sm:h-[52px] px-[22px] sm:px-[28px] rounded-[14px] border border-white/20 bg-white/[0.03] text-white/80 text-[14px] sm:text-[15px] font-[450] transition-all hover:bg-white/10 hover:text-white hover:border-white/30"
              >
                Decline
              </Link>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex items-center justify-center gap-2 h-[48px] sm:h-[52px] px-[26px] sm:px-[32px] bg-[#E9E9E9] rounded-[14px] text-[#0A0707] text-[14px] sm:text-[15px] font-[450] transition-all hover:bg-white hover:shadow-[0_0_25px_rgba(255,255,255,0.25)] disabled:opacity-50"
              >
                {loading ? 'Computing Hash...' : 'Approve & Continue'}
                <ArrowRight className="w-4 h-4 text-black/70" />
              </button>
            </div>
          </div>
        </Animate>
      </div>
    </PageContainer>
  );
}
