"use client";

import React from 'react';
import Link from 'next/link';
import { Animate, PageContainer } from '../components/Shared';

export default function Result() {
  const isLoggedIn = true;

  return (
    <PageContainer isLoggedIn={isLoggedIn} showVideo={false}>
      <div className="flex flex-col items-center justify-center max-w-[600px] mx-auto w-full">
        <Animate delay={300} direction="up" className="w-full text-center">
          <div className="w-20 h-20 bg-[#10B981]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#10B981]/20">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h1 className="text-white text-[32px] sm:text-[48px] font-normal leading-[1.1] mb-4">
            Verification Successful
          </h1>
          <p className="text-white/80 text-[16px] sm:text-[18px] font-[450] leading-[1.4] mb-10 max-w-[440px] mx-auto">
            Your zero-knowledge proof has been successfully verified on the Soroban network.
          </p>
        </Animate>

        <Animate delay={500} direction="scale" className="w-full">
          <div className="w-full rounded-[24px] sm:rounded-[33px] bg-[rgba(17,16,15,0.35)] backdrop-blur-[20px] p-6 sm:p-10 border border-white/5 relative overflow-hidden">
            
            <div className="p-4 rounded-[16px] bg-white/5 border border-white/10 mb-8 space-y-4">
              <div className="flex flex-col">
                <span className="text-white/60 text-[13px] uppercase tracking-wider mb-1">Transaction Hash</span>
                <span className="text-white text-[14px] font-mono break-all">0x8f2a...39d1b</span>
              </div>
              <div className="w-full h-px bg-white/10" />
              <div className="flex flex-col">
                <span className="text-white/60 text-[13px] uppercase tracking-wider mb-1">Verification Payload</span>
                <div className="bg-black/20 p-3 rounded-[12px] font-mono text-[12px] text-white/70 overflow-x-auto">
                  <pre>{`{
  "protocol": "groth16",
  "curve": "bn128",
  "publicSignals": ["1", "0x3a...", "0x0"],
  "proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...] }
}`}</pre>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <Link href="/demo-verifier" className="flex items-center justify-center h-[46px] sm:h-[51px] px-[20px] sm:px-[27px] rounded-[12px] border border-white/30 text-white text-[14px] sm:text-[15.5px] font-[450] leading-[15.5px] transition-all hover:bg-white/5">
                View on Verifier App
              </Link>
              <Link href="/wallet" className="flex items-center justify-center h-[46px] sm:h-[51px] px-[20px] sm:px-[27px] bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[14px] sm:text-[15.5px] font-[450] leading-[15.5px] transition-opacity hover:opacity-90">
                Return to Wallet
              </Link>
            </div>
          </div>
        </Animate>
      </div>
    </PageContainer>
  );
}
