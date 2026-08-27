"use client";

import React, { useState } from 'react';
import { Animate, PageContainer } from '../components/Shared';

export default function DemoVerifier() {
  const [proofStatus, setProofStatus] = useState<'waiting' | 'verified'>('waiting');

  return (
    <PageContainer isLoggedIn={false} showVideo={false}>
      <div className="flex flex-col items-center justify-center max-w-[800px] mx-auto w-full">
        <Animate delay={300} direction="up" className="w-full text-center">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full mb-6">
            <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-white/80 text-[13px] font-medium tracking-wide uppercase">Mock Service Partner App</span>
          </div>
          <h1 className="text-white text-[32px] sm:text-[48px] font-normal leading-[1.1] mb-4">
            Age Restricted Content
          </h1>
          <p className="text-white/80 text-[16px] sm:text-[18px] font-[450] leading-[1.4] mb-10 max-w-[440px] mx-auto">
            This demo application requires users to be over 18. It accepts zero-knowledge proofs from NIVAAN without knowing your actual date of birth.
          </p>
        </Animate>

        <Animate delay={500} direction="scale" className="w-full">
          <div className="w-full rounded-[24px] sm:rounded-[33px] bg-[rgba(17,16,15,0.35)] backdrop-blur-[20px] p-6 sm:p-10 border border-white/5 relative overflow-hidden flex flex-col md:flex-row gap-8 items-center">
            
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-white text-[24px] font-medium mb-3">Verification Gateway</h2>
              <p className="text-white/60 text-[15px] mb-8">
                Generate a proof in your NIVAAN wallet to unlock access.
              </p>

              {proofStatus === 'waiting' ? (
                <div className="flex flex-col items-center md:items-start">
                  <div className="w-12 h-12 rounded-full border-4 border-white/10 border-t-[#E9E9E9] animate-spin mb-4" />
                  <p className="text-white/80 font-medium">Waiting for Proof...</p>
                  <p className="text-white/40 text-[13px]">Listening on Soroban network</p>
                  <button 
                    onClick={() => setProofStatus('verified')}
                    className="mt-6 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white/40 text-[12px] hover:text-white transition-colors"
                  >
                    Simulate Verification
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center md:items-start">
                  <div className="w-12 h-12 bg-[#10B981]/20 rounded-full flex items-center justify-center mb-4 border border-[#10B981]/30">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <p className="text-[#10B981] font-medium text-[18px] mb-1">Access Granted</p>
                  <p className="text-white/60 text-[13px] mb-6">Zero-knowledge proof verified</p>
                  
                  <button 
                    onClick={() => setProofStatus('waiting')}
                    className="flex items-center justify-center h-[46px] px-[24px] bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[14px] font-[450] transition-opacity hover:opacity-90"
                  >
                    Enter Application
                  </button>
                </div>
              )}
            </div>

            <div className="hidden md:block w-px h-[200px] bg-white/10 mx-4" />

            <div className="flex-1 w-full bg-black/40 rounded-[20px] p-6 border border-white/5 font-mono text-[12px] text-white/50 h-[280px] overflow-y-auto">
              <p className="text-white/80 mb-2">Logs:</p>
              {proofStatus === 'waiting' ? (
                <>
                  <p className="mb-1">&gt; Initializing verifier instance...</p>
                  <p className="mb-1">&gt; Connecting to Soroban RPC...</p>
                  <p className="mb-1">&gt; Listening for proof on contract 0x8A4b...</p>
                  <p className="animate-pulse">&gt; _</p>
                </>
              ) : (
                <>
                  <p className="mb-1">&gt; Initializing verifier instance...</p>
                  <p className="mb-1">&gt; Connecting to Soroban RPC...</p>
                  <p className="mb-1">&gt; Listening for proof on contract 0x8A4b...</p>
                  <p className="mb-1 text-white/80">&gt; Proof received! Hash: 0x8f2a...39d1b</p>
                  <p className="mb-1">&gt; Parsing Groth16 payload...</p>
                  <p className="mb-1">&gt; Checking public signals (age &gt; 18)...</p>
                  <p className="mb-1 text-[#10B981]">&gt; Verification OK.</p>
                </>
              )}
            </div>

          </div>
        </Animate>
      </div>
    </PageContainer>
  );
}
