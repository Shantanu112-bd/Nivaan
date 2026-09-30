"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Animate, PageContainer, WorkflowSteps } from '../components/Shared';
import { connectAndAuthenticate } from '@/lib/wallets/clientWallet';
import { QrCode, ShieldCheck, RefreshCw, Sparkles, AlertCircle } from 'lucide-react';

const DEFAULT_SAMPLE_QR = "413980064395675672371227137711583253818588855011140279517448839820612623632349901856184351959999993482778047983380439368130654000523344778832306969762570511482";

export default function Onboarding() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [qrData, setQrData] = useState(DEFAULT_SAMPLE_QR);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => {
        if (res.ok) setIsLoggedIn(true);
      })
      .catch(() => {});
  }, []);

  const handleIssue = async () => {
    setErrorMsg('');
    setLoading(true);

    try {
      // 1. Ensure authenticated session
      let sessionActive = isLoggedIn;
      if (!sessionActive) {
        setStatusMsg('Connecting wallet & signing session...');
        await connectAndAuthenticate();
        setIsLoggedIn(true);
        sessionActive = true;
      }

      // 2. Issue credential
      setStatusMsg('Evaluating zero-knowledge compliance circuit on Midnight...');
      const issueRes = await fetch('/api/credentials/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          circuitProofInput: { aadhaarQrData: qrData },
          jurisdiction: 'IN',
        }),
      });

      if (!issueRes.ok) {
        const err = await issueRes.json();
        throw new Error(err.error || `Issuance failed with status ${issueRes.status}`);
      }

      const data = await issueRes.json();
      localStorage.setItem('nivaan_credential_id', data.credentialId);
      localStorage.setItem('nivaan_credential_issued_at', data.issuedAt);

      setStatusMsg('Credential issued! Redirecting to wallet...');
      setTimeout(() => {
        router.push('/wallet');
      }, 500);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to issue credential');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer isLoggedIn={isLoggedIn} showVideo={false}>
      <div className="flex flex-col items-center justify-center max-w-[620px] mx-auto w-full">
        <WorkflowSteps currentStep="onboarding" />

        <Animate delay={200} direction="up" className="w-full text-center">
          <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] px-3.5 py-1.5 rounded-full mb-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/80 text-[12.5px] font-[450] tracking-wide uppercase">Zero-Knowledge Identity Verification</span>
          </div>

          <h1 className="text-white text-[34px] sm:text-[48px] font-normal leading-[1.05] tracking-[-0.02em] mb-4">
            Verify Identity
          </h1>
          <p className="text-white/70 text-[15px] sm:text-[17px] font-[450] leading-[1.4] mb-8 max-w-[440px] mx-auto">
            Derive a verifiable privacy-preserving credential using the Anon Aadhaar cryptographic circuit.
          </p>
        </Animate>

        <Animate delay={400} direction="scale" className="w-full">
          <div className="w-full rounded-[28px] sm:rounded-[36px] nivaan-glass-card p-6 sm:p-10 text-center relative overflow-hidden">
            {/* Top ambient highlight */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            {/* Futuristic QR Scanner Box */}
            <div className="relative w-full max-w-[320px] aspect-square mx-auto rounded-[20px] bg-black/40 border border-white/10 flex flex-col items-center justify-center mb-6 p-6 overflow-hidden shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]">
              {/* Corner brackets */}
              <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-white/40" />
              <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-white/40" />
              <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-white/40" />
              <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-white/40" />

              {/* Animated scanning laser */}
              <div className="absolute inset-x-4 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-scan pointer-events-none shadow-[0_0_12px_rgba(52,211,153,0.8)]" />

              <div className="w-16 h-16 rounded-[16px] bg-white/[0.04] border border-white/10 flex items-center justify-center mb-3">
                <QrCode className="w-8 h-8 text-white/70" />
              </div>

              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full text-emerald-400 text-[11.5px] font-medium mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Anon Aadhaar Test QR V2</span>
              </div>

              <p className="text-white/40 text-[11px] font-mono break-all line-clamp-2 px-2 text-center">
                Payload: {qrData.slice(0, 32)}...
              </p>
            </div>

            {/* Error Banner */}
            {errorMsg && (
              <div className="mb-6 p-3.5 rounded-[14px] bg-red-500/10 border border-red-500/30 text-red-300 text-[13.5px] flex items-center gap-2 text-left animate-fade-down">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Status / Loading Banner */}
            {statusMsg && !errorMsg && (
              <div className="mb-6 p-3.5 rounded-[14px] bg-white/[0.04] border border-white/10 text-white/90 text-[13.5px] flex items-center justify-center gap-2 animate-fade-down">
                <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                <span>{statusMsg}</span>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <button
                onClick={() => setQrData(DEFAULT_SAMPLE_QR)}
                disabled={loading}
                className="flex items-center justify-center gap-2 h-[48px] sm:h-[52px] px-[22px] sm:px-[28px] rounded-[14px] border border-white/20 bg-white/[0.03] text-white/80 text-[14px] sm:text-[15px] font-[450] transition-all hover:bg-white/10 hover:text-white hover:border-white/30 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Test QR</span>
              </button>
              <button
                onClick={handleIssue}
                disabled={loading}
                className="flex items-center justify-center gap-2 h-[48px] sm:h-[52px] px-[24px] sm:px-[30px] bg-[#E9E9E9] rounded-[14px] text-[#0A0707] text-[14px] sm:text-[15px] font-[450] transition-all hover:bg-white hover:shadow-[0_0_25px_rgba(255,255,255,0.25)] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    <span>Processing Circuit...</span>
                  </>
                ) : (
                  <>
                    <span>Issue Credential</span>
                    <Sparkles className="w-3.5 h-3.5 text-black/70" />
                  </>
                )}
              </button>
            </div>
          </div>
        </Animate>
      </div>
    </PageContainer>
  );
}
