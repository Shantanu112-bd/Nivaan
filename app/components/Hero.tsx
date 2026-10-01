"use client";

import React from 'react';
import Link from 'next/link';
import { Animate, PageContainer } from './Shared';

function ZKStatsCard() {
  return (
    <Animate className="w-full max-w-[405px] mx-auto lg:mx-0" delay={900} direction="scale">
      <div className="w-full rounded-[24px] sm:rounded-[33px] bg-[rgba(17,16,15,0.35)] backdrop-blur-[20px] pt-8 px-6 pb-8 sm:pt-12 sm:px-10 sm:pb-12 text-center">
        <p className="text-white text-[32px] sm:text-[42px] font-[450] leading-[1.1] mb-2 sm:mb-3">
          2
        </p>
        <p className="text-white/60 text-[14px] sm:text-[16px] font-[450] leading-[20px] mb-6 sm:mb-8 uppercase tracking-wider">
          Verifier Chains
        </p>
        <div className="w-full h-px bg-white/10 mb-6 sm:mb-8" />
        <p className="text-white text-[32px] sm:text-[42px] font-[450] leading-[1.1] mb-2 sm:mb-3">
          0
        </p>
        <p className="text-white/60 text-[14px] sm:text-[16px] font-[450] leading-[20px] uppercase tracking-wider">
          Documents Stored
        </p>
      </div>
    </Animate>
  );
}

export default function Hero() {
  // TODO: wire to actual auth state
  const isLoggedIn = false;

  return (
    <PageContainer isLoggedIn={isLoggedIn}>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-[40px] lg:gap-[48px] w-full">
        <div className="max-w-[593px]">
          <Animate delay={300} direction="up">
            <h1 className="text-white text-[36px] sm:text-[52px] md:text-[64px] lg:text-[72px] font-normal leading-[0.95] mb-5 sm:mb-8">
              Zero-knowledge compliance for the decentralized web
            </h1>
          </Animate>
          <Animate delay={500} direction="up">
            <p className="text-white/80 text-[16px] sm:text-[18px] md:text-[20px] font-[450] leading-[1.3] max-w-[420px] mb-7 sm:mb-10">
              Prove eligibility without exposing underlying documents. Issued on Midnight, verified on Soroban and Sepolia.
            </p>
          </Animate>
          <Animate delay={700} direction="up">
            <div className="flex flex-wrap gap-3 sm:gap-4 items-center">
              {!isLoggedIn && (
                <Link href="/onboarding" className="nivaan-btn-primary h-[48px] sm:h-[52px] px-[24px] sm:px-[30px] rounded-[13px] text-[14.5px] sm:text-[15.5px]">
                  <span>Connect Wallet</span>
                </Link>
              )}
              <Link href={isLoggedIn ? "/prove" : "/onboarding"} className="nivaan-btn-secondary h-[48px] sm:h-[52px] px-[24px] sm:px-[30px] rounded-[13px] text-[14.5px] sm:text-[15.5px]">
                <span>Generate Proof</span>
              </Link>
            </div>
          </Animate>
        </div>
        <ZKStatsCard />
      </div>
    </PageContainer>
  );
}
