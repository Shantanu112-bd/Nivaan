"use client";

import React from 'react';
import Link from 'next/link';
import { Animate, PageContainer } from '../components/Shared';

export default function Consent() {
  const isLoggedIn = false;

  return (
    <PageContainer isLoggedIn={isLoggedIn} showVideo={false}>
      <div className="flex flex-col items-center justify-center max-w-[600px] mx-auto w-full">
        <Animate delay={300} direction="up" className="w-full text-center">
          <h1 className="text-white text-[32px] sm:text-[48px] font-normal leading-[1.1] mb-4">
            Data Consent
          </h1>
          <p className="text-white/80 text-[16px] sm:text-[18px] font-[450] leading-[1.4] mb-10 max-w-[440px] mx-auto">
            Review the data being requested to generate your zero-knowledge credential.
          </p>
        </Animate>

        <Animate delay={500} direction="scale" className="w-full">
          <div className="w-full rounded-[24px] sm:rounded-[33px] bg-[rgba(17,16,15,0.35)] backdrop-blur-[20px] p-6 sm:p-10 border border-white/5">
            <div className="flex flex-col gap-4 mb-8">
              <div className="p-4 rounded-[16px] bg-white/5 border border-white/10 flex justify-between items-center">
                <span className="text-white/80 text-[15px] font-[450]">Age Verification (&gt;18)</span>
                <span className="text-[#E9E9E9] text-[14px] bg-white/10 px-3 py-1 rounded-full">Required</span>
              </div>
              <div className="p-4 rounded-[16px] bg-white/5 border border-white/10 flex justify-between items-center">
                <span className="text-white/80 text-[15px] font-[450]">Nationality Status</span>
                <span className="text-[#E9E9E9] text-[14px] bg-white/10 px-3 py-1 rounded-full">Required</span>
              </div>
            </div>
            
            <p className="text-white/60 text-[13px] leading-[1.5] mb-8 text-center max-w-[380px] mx-auto">
              Your raw data is never exposed. The credential is issued securely on Midnight and verified via zero-knowledge proofs.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <Link href="/onboarding" className="flex items-center justify-center h-[46px] sm:h-[51px] px-[20px] sm:px-[27px] rounded-[12px] border border-white/30 text-white text-[14px] sm:text-[15.5px] font-[450] leading-[15.5px] transition-all hover:bg-white/5">
                Decline
              </Link>
              <Link href="/wallet" className="flex items-center justify-center h-[46px] sm:h-[51px] px-[20px] sm:px-[27px] bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[14px] sm:text-[15.5px] font-[450] leading-[15.5px] transition-opacity hover:opacity-90">
                Approve & Issue
              </Link>
            </div>
          </div>
        </Animate>
      </div>
    </PageContainer>
  );
}
