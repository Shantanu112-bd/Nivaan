"use client";

import React from 'react';
import Link from 'next/link';
import { Animate, PageContainer } from '../components/Shared';

export default function Wallet() {
  const isLoggedIn = true;

  return (
    <PageContainer isLoggedIn={isLoggedIn} showVideo={false}>
      <div className="flex flex-col max-w-[1000px] mx-auto w-full">
        <Animate delay={300} direction="up" className="w-full mb-10">
          <h1 className="text-white text-[32px] sm:text-[48px] font-normal leading-[1.1] mb-2">
            Credential Wallet
          </h1>
          <p className="text-white/80 text-[16px] sm:text-[18px] font-[450] leading-[1.4]">
            Manage your issued zero-knowledge credentials.
          </p>
        </Animate>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Animate delay={500} direction="scale">
            <div className="w-full rounded-[24px] sm:rounded-[33px] bg-[rgba(17,16,15,0.35)] backdrop-blur-[20px] p-6 sm:p-8 border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 sm:p-8">
                <span className="bg-[#10B981]/20 text-[#10B981] px-3 py-1 rounded-full text-[13px] font-medium border border-[#10B981]/30">
                  Active
                </span>
              </div>
              
              <div className="mb-6">
                <p className="text-white/60 text-[14px] font-[450] mb-1">Credential Type</p>
                <p className="text-white text-[20px] font-medium">Verified Identity</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <span className="text-white/60 text-[14px]">Issued By</span>
                  <span className="text-white text-[14px] font-[450]">Midnight Network</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <span className="text-white/60 text-[14px]">Date Issued</span>
                  <span className="text-white text-[14px] font-[450]">Oct 24, 2026</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60 text-[14px]">Expires</span>
                  <span className="text-white text-[14px] font-[450]">Oct 24, 2027</span>
                </div>
              </div>

              <div className="flex gap-3 mt-auto">
                <Link href="/prove" className="flex-1 flex items-center justify-center h-[46px] bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[14.5px] font-[450] transition-opacity hover:opacity-90">
                  Generate Proof
                </Link>
                <button className="flex items-center justify-center h-[46px] px-6 rounded-[12px] border border-white/30 text-white/80 text-[14.5px] font-[450] transition-all hover:bg-white/5 hover:text-white">
                  Revoke
                </button>
              </div>
            </div>
          </Animate>

          <Animate delay={600} direction="scale">
            <div className="w-full h-full rounded-[24px] sm:rounded-[33px] border-2 border-dashed border-white/10 flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </div>
              <p className="text-white/80 text-[16px] font-[450] mb-2">Add New Credential</p>
              <p className="text-white/40 text-[14px]">Import from issuer or scan QR</p>
            </div>
          </Animate>
        </div>
      </div>
    </PageContainer>
  );
}
