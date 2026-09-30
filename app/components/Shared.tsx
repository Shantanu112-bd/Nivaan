"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Shield, CheckCircle2, ChevronRight } from 'lucide-react';

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

export function WorkflowSteps({ currentStep }: { currentStep: 'onboarding' | 'wallet' | 'consent' | 'prove' | 'result' }) {
  const steps = [
    { key: 'onboarding', label: '1. Identity', href: '/onboarding' },
    { key: 'wallet', label: '2. Credential', href: '/wallet' },
    { key: 'consent', label: '3. Consent', href: '/consent' },
    { key: 'prove', label: '4. ZK Proof', href: '/prove' },
    { key: 'result', label: '5. Attestation', href: '/result' },
  ];

  const currentIndex = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="w-full max-w-[680px] mx-auto mb-8 sm:mb-12">
      <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 rounded-full bg-white/[0.03] border border-white/[0.08] backdrop-blur-[16px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
        {steps.map((step, idx) => {
          const isPassed = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <React.Fragment key={step.key}>
              <Link
                href={step.href}
                className={`flex items-center gap-1.5 text-[11px] sm:text-[13px] font-[450] transition-colors ${
                  isCurrent
                    ? 'text-white font-medium bg-white/[0.1] px-2.5 sm:px-3 py-1 rounded-full border border-white/20'
                    : isPassed
                    ? 'text-emerald-400 hover:text-emerald-300'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {isPassed && <CheckCircle2 className="w-3 h-3 text-emerald-400 hidden sm:inline" />}
                <span>{step.label}</span>
              </Link>
              {idx < steps.length - 1 && (
                <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function Nav({ isLoggedIn: initialIsLoggedIn }: { isLoggedIn?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(initialIsLoggedIn ?? false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => {
        if (res.ok) {
          setIsLoggedIn(true);
        } else if (initialIsLoggedIn === undefined) {
          setIsLoggedIn(false);
        }
      })
      .catch(() => {});
  }, [initialIsLoggedIn]);

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
        <Link href="/" className="flex items-center gap-2.5 group">
          <svg width="28" height="28" viewBox="0 0 256 256" fill="none" className="sm:w-[32px] sm:h-[32px] transition-transform duration-300 group-hover:scale-105">
            <path fill="white" d="M 256 256 L 178 256 C 150.386 256 128 233.614 128 206 L 128 256 L 0 256 L 0 192 C 0 156.654 28.654 128 64 128 C 99.346 128 128 156.654 128 192 L 128 128 L 256 128 Z M 78 0 C 105.614 0 128 22.386 128 50 L 128 0 L 256 0 L 256 64 C 256 99.346 227.346 128 192 128 C 156.654 128 128 99.346 128 64 L 128 128 L 0 128 L 0 0 Z" />
          </svg>
          <div className="flex flex-col">
            <span className="text-white text-[22px] sm:text-[26px] font-[450] leading-none tracking-[-0.02em]">NIVAAN</span>
          </div>
        </Link>
      </Animate>
      
      <Animate className="hidden lg:flex items-center gap-3" delay={100} direction="down">
        <div className="h-[46px] px-[16px] flex items-center gap-2 bg-[rgba(10,7,7,0.4)] border border-white/[0.06] rounded-[11px] backdrop-blur-[17px]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white/70 text-[12px] font-mono tracking-wider">MIDNIGHT PREVIEW</span>
        </div>
        <div className="h-[46px] px-[20px] flex items-center gap-[24px] bg-[rgba(10,7,7,0.4)] border border-white/[0.06] rounded-[11px] backdrop-blur-[17px]">
          <Link href="/wallet" className="text-white/80 text-[13.5px] font-[450] leading-[14px] hover:text-white transition-colors">
            App
          </Link>
          <Link href="/demo-verifier" className="text-white/60 text-[13.5px] font-[450] leading-[14px] hover:text-white transition-colors flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-white/50" />
            <span>Verifier Portal</span>
          </Link>
        </div>
      </Animate>

      <Animate className="hidden lg:block" delay={200} direction="down">
        <div className="h-[50px] p-[2px] bg-black/40 border border-white/[0.08] rounded-[13px] backdrop-blur-[17px] flex items-center shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          {isLoggedIn ? (
            <Link href="/wallet" className="nivaan-btn-primary h-[44px] px-[22px] rounded-[11px] text-[13.5px]">
              Credential Wallet
            </Link>
          ) : (
            <Link href="/onboarding" className="nivaan-btn-primary h-[44px] px-[22px] rounded-[11px] text-[13.5px]">
              Connect Wallet
            </Link>
          )}
        </div>
      </Animate>

      <Animate className="lg:hidden" delay={100} direction="down">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 flex items-center justify-center bg-[rgba(10,7,7,0.35)] rounded-full backdrop-blur-[17px] text-white border border-white/10"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </Animate>

      <div className={`lg:hidden fixed inset-0 z-40 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-[#080A19]/90 backdrop-blur-[24px] transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsOpen(false)} />
        <div className={`absolute top-[76px] sm:top-[86px] left-4 right-4 sm:left-6 sm:right-6 bg-[rgba(17,16,15,0.75)] backdrop-blur-[30px] rounded-[20px] border border-white/[0.1] p-6 sm:p-8 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] origin-top shadow-[0_20px_60px_rgba(0,0,0,0.6)] ${isOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-[0.97]'}`}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 pb-2 border-b border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white/60 text-[12px] font-mono">MIDNIGHT PREVIEW ACTIVE</span>
            </div>
            <Link href="/wallet" onClick={() => setIsOpen(false)} className="text-white/90 text-[16px] font-[450] hover:text-white">
              Credential Wallet
            </Link>
            <Link href="/demo-verifier" onClick={() => setIsOpen(false)} className="text-white/70 text-[16px] font-[450] hover:text-white">
              Partner Verifier Portal
            </Link>
          </div>
          <div className="h-px bg-white/10 my-5" />
          <div className="flex flex-col gap-3">
            {isLoggedIn ? (
              <Link href="/wallet" onClick={() => setIsOpen(false)} className="nivaan-btn-primary h-[46px] w-full rounded-[12px] text-[15px]">
                Open Wallet
              </Link>
            ) : (
              <Link href="/onboarding" onClick={() => setIsOpen(false)} className="nivaan-btn-primary h-[46px] w-full rounded-[12px] text-[15px]">
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
    <section className="relative w-full min-h-screen flex flex-col bg-[#080A19] overflow-x-hidden">
      {/* Background Layer */}
      {showVideo ? (
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260813_092641_de52eb87-daf2-41db-92cb-7a56eae012a5.mp4"
          autoPlay
          loop
          muted
          playsInline
          suppressHydrationWarning
        />
      ) : (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Subtle cosmic ambient lights matching landing page atmosphere */}
          <div className="absolute top-[-10%] left-[20%] w-[600px] h-[500px] rounded-full bg-gradient-to-br from-indigo-900/25 via-purple-900/15 to-transparent blur-[120px] animate-pulse-glow" />
          <div className="absolute top-[30%] right-[10%] w-[500px] h-[450px] rounded-full bg-gradient-to-bl from-blue-900/20 via-cyan-950/15 to-transparent blur-[110px]" />
          <div className="absolute bottom-[5%] left-[10%] w-[450px] h-[400px] rounded-full bg-gradient-to-tr from-emerald-950/20 via-slate-900/10 to-transparent blur-[100px]" />
          {/* Subtle dot matrix grid for depth */}
          <div 
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.8) 1px, transparent 1px)',
              backgroundSize: '32px 32px'
            }}
          />
        </div>
      )}

      {/* Main Content Layer */}
      <div className="relative z-10 flex-1 flex flex-col w-full">
        <Nav isLoggedIn={isLoggedIn} />
        <main className="flex-1 flex flex-col justify-center items-center py-6 sm:py-10 w-full">
          <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 md:px-12 flex flex-col items-center justify-center">
            {children}
          </div>
        </main>
      </div>
    </section>
  );
}
