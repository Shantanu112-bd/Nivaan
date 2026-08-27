"use client";

import React from 'react';
import Link from 'next/link';
import { Animate, PageContainer } from '../components/Shared';

export default function Onboarding() {
  const isLoggedIn = false;

  return (
    <PageContainer isLoggedIn={isLoggedIn} showVideo={false}>
      <div className="flex flex-col items-center justify-center max-w-[600px] mx-auto w-full">
        <Animate delay={300} direction="up" className="w-full text-center">
          <h1 className="text-white text-[32px] sm:text-[48px] font-normal leading-[1.1] mb-4">
            Verify Identity
          </h1>
          <p className="text-white/80 text-[16px] sm:text-[18px] font-[450] leading-[1.4] mb-10 max-w-[400px] mx-auto">
            Scan or upload your Aadhaar Test QR to generate a zero-knowledge credential.
          </p>
        </Animate>

        <Animate delay={500} direction="scale" className="w-full">
          <div className="w-full rounded-[24px] sm:rounded-[33px] bg-[rgba(17,16,15,0.35)] backdrop-blur-[20px] p-6 sm:p-10 text-center border border-white/5">
            <div className="w-full max-w-[300px] aspect-square mx-auto bg-white/5 rounded-[16px] border-2 border-dashed border-white/20 flex flex-col items-center justify-center mb-8">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40 mb-4">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                <path d="M3 9h18"/>
                <path d="M9 21V9"/>
              </svg>
              <p className="text-white/60 text-[14px] font-[450]">Upload Aadhaar QR</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <button className="flex items-center justify-center h-[46px] sm:h-[51px] px-[20px] sm:px-[27px] rounded-[12px] border border-white/30 text-white text-[14px] sm:text-[15.5px] font-[450] leading-[15.5px] transition-all hover:bg-white/5">
                Scan with Camera
              </button>
              <Link href="/consent" className="flex items-center justify-center h-[46px] sm:h-[51px] px-[20px] sm:px-[27px] bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[14px] sm:text-[15.5px] font-[450] leading-[15.5px] transition-opacity hover:opacity-90">
                Continue to Consent
              </Link>
            </div>
          </div>
        </Animate>
      </div>
    </PageContainer>
  );
}
