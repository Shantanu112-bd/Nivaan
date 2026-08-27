"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export function Animate({ children, delay = 0, className = '', direction = 'up' }: { children: React.ReactNode, delay?: number, className?: string, direction?: 'up' | 'down' | 'left' | 'right' | 'scale' }) {
  const directionClass = {
    up: 'animate-fade-up',
    down: 'animate-fade-down',
    left: 'animate-fade-left',
    right: 'animate-fade-right',
    scale: 'animate-fade-scale'
  }[direction];

  return (
    <div
      className={`opacity-0 ${directionClass} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function Nav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <nav className="w-full max-w-[1800px] mx-auto px-[20px] sm:px-[32px] md:px-[82px] pt-[20px] sm:pt-[30px] flex items-center justify-between relative z-50">
      <Animate delay={0} direction="down">
        <Link href="/" className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 256 256" fill="none" className="sm:w-[32px] sm:h-[32px]">
            <path fill="white" d="M 256 256 L 178 256 C 150.386 256 128 233.614 128 206 L 128 256 L 0 256 L 0 192 C 0 156.654 28.654 128 64 128 C 99.346 128 128 156.654 128 192 L 128 128 L 256 128 Z M 78 0 C 105.614 0 128 22.386 128 50 L 128 0 L 256 0 L 256 64 C 256 99.346 227.346 128 192 128 C 156.654 128 128 99.346 128 64 L 128 128 L 0 128 L 0 0 Z" />
          </svg>
          <span className="text-white text-[22px] sm:text-[26px] font-[450] leading-none tracking-[-0.02em]">NIVAAN</span>
        </Link>
      </Animate>
      
      <Animate className="hidden lg:block" delay={100} direction="down">
        <div className="h-[52px] px-[24px] flex items-center gap-[30px] bg-[rgba(10,7,7,0.35)] rounded-[11px] backdrop-blur-[17px]">
          <Link href="/docs" className="text-white/80 text-[14px] font-[450] leading-[14px] hover:text-white transition-colors">Docs</Link>
        </div>
      </Animate>

      <Animate className="hidden lg:block" delay={200} direction="down">
        <div className="h-[52px] p-[3px] bg-[rgba(0,0,0,0.35)] rounded-[13px] backdrop-blur-[17px] flex items-center gap-[5px]">
          {isLoggedIn ? (
            <Link href="/wallet" className="flex items-center justify-center h-[46px] px-[24px] bg-[#E9E9E9] rounded-[11px] text-[#0A0707] text-[14px] font-[450] leading-[14px] hover:bg-white transition-colors">
              Credential Wallet
            </Link>
          ) : (
            <Link href="/onboarding" className="flex items-center justify-center h-[46px] px-[24px] bg-[#E9E9E9] rounded-[11px] text-[#0A0707] text-[14px] font-[450] leading-[14px] hover:bg-white transition-colors">
              Connect Wallet
            </Link>
          )}
        </div>
      </Animate>

      <Animate className="lg:hidden" delay={100} direction="down">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 flex items-center justify-center bg-[rgba(10,7,7,0.35)] rounded-full backdrop-blur-[17px] text-white"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </Animate>

      <div className={`lg:hidden fixed inset-0 z-40 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-[#080A19]/90 backdrop-blur-[24px] transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsOpen(false)} />
        <div className={`absolute top-[76px] sm:top-[86px] left-4 right-4 sm:left-6 sm:right-6 bg-[rgba(17,16,15,0.6)] backdrop-blur-[30px] rounded-[20px] border border-white/[0.06] p-6 sm:p-8 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] origin-top ${isOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-[0.97]'}`}>
          <div className="flex flex-col gap-4">
            <Link href="/docs" className="text-white/80 text-[18px] font-[450]">Docs</Link>
          </div>
          <div className="h-px bg-white/10 my-5" />
          <div className="flex flex-col gap-3">
            {isLoggedIn ? (
              <Link href="/wallet" className="flex items-center justify-center h-[46px] w-full bg-[#E9E9E9] rounded-[11px] text-[#0A0707] text-[15px] font-[450] transition-colors">
                Credential Wallet
              </Link>
            ) : (
              <Link href="/onboarding" className="flex items-center justify-center h-[46px] w-full bg-[#E9E9E9] rounded-[11px] text-[#0A0707] text-[15px] font-[450] transition-colors">
                Connect Wallet
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export function PageContainer({ children, isLoggedIn = false, showVideo = false }: { children: React.ReactNode, isLoggedIn?: boolean, showVideo?: boolean }) {
  return (
    <section className="relative w-full min-h-screen flex flex-col bg-[#080A19]">
      {showVideo && (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260813_092641_de52eb87-daf2-41db-92cb-7a56eae012a5.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
      )}
      <div className="relative z-10 flex-1 flex flex-col">
        <Nav isLoggedIn={isLoggedIn} />
        <div className="flex-1 flex flex-col justify-center py-8">
          <div className="w-full max-w-[1800px] mx-auto px-[20px] sm:px-[32px] md:px-[82px]">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
