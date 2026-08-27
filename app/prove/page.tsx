"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Animate, PageContainer } from '../components/Shared';

export default function Prove() {
  const isLoggedIn = true;
  const [selectedNetwork, setSelectedNetwork] = useState<'soroban' | 'sepolia'>('soroban');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleGenerate = () => {
    setIsGenerating(true);
    let current = 0;
    const interval = setInterval(() => {
      current += 10;
      setProgress(current);
      if (current >= 100) {
        clearInterval(interval);
        window.location.href = '/result';
      }
    }, 400);
  };

  return (
    <PageContainer isLoggedIn={isLoggedIn} showVideo={false}>
      <div className="flex flex-col items-center justify-center max-w-[600px] mx-auto w-full">
        <Animate delay={300} direction="up" className="w-full text-center">
          <h1 className="text-white text-[32px] sm:text-[48px] font-normal leading-[1.1] mb-4">
            Generate Proof
          </h1>
          <p className="text-white/80 text-[16px] sm:text-[18px] font-[450] leading-[1.4] mb-10 max-w-[440px] mx-auto">
            Select a target network to verify your credential without exposing the underlying data.
          </p>
        </Animate>

        <Animate delay={500} direction="scale" className="w-full">
          <div className="w-full rounded-[24px] sm:rounded-[33px] bg-[rgba(17,16,15,0.35)] backdrop-blur-[20px] p-6 sm:p-10 border border-white/5 relative overflow-hidden">
            
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-[#E9E9E9] animate-spin mb-6" />
                <p className="text-white text-[20px] font-[450] mb-2">Generating Zero-Knowledge Proof...</p>
                <p className="text-white/60 text-[14px] mb-8">This happens locally on your device.</p>
                
                <div className="w-full max-w-[300px] h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#E9E9E9] transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <p className="text-white/80 text-[14px] uppercase tracking-wider font-[450] mb-4">Target Network</p>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <button 
                      onClick={() => setSelectedNetwork('soroban')}
                      className={`flex flex-col items-center justify-center p-4 rounded-[16px] border transition-all ${selectedNetwork === 'soroban' ? 'bg-white/10 border-white/40' : 'bg-transparent border-white/10 hover:bg-white/5'}`}
                    >
                      <span className="text-white font-medium text-[16px]">Soroban</span>
                    </button>
                    <button 
                      onClick={() => setSelectedNetwork('sepolia')}
                      className={`flex flex-col items-center justify-center p-4 rounded-[16px] border transition-all ${selectedNetwork === 'sepolia' ? 'bg-white/10 border-white/40' : 'bg-transparent border-white/10 hover:bg-white/5'}`}
                    >
                      <span className="text-white font-medium text-[16px]">Sepolia</span>
                    </button>
                  </div>
                </div>
                
                <div className="p-4 rounded-[16px] bg-white/5 border border-white/10 mb-8">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white/60 text-[14px]">Selected Credential</span>
                    <span className="text-white text-[14px] font-[450]">Verified Identity</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-[14px]">Required Proofs</span>
                    <span className="text-white text-[14px] font-[450]">Age &gt; 18, Nationality</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                  <Link href="/wallet" className="flex items-center justify-center h-[46px] sm:h-[51px] px-[20px] sm:px-[27px] rounded-[12px] border border-white/30 text-white text-[14px] sm:text-[15.5px] font-[450] leading-[15.5px] transition-all hover:bg-white/5">
                    Cancel
                  </Link>
                  <button 
                    onClick={handleGenerate}
                    className="flex items-center justify-center h-[46px] sm:h-[51px] px-[20px] sm:px-[27px] bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[14px] sm:text-[15.5px] font-[450] leading-[15.5px] transition-opacity hover:opacity-90"
                  >
                    Generate Proof
                  </button>
                </div>
              </>
            )}
          </div>
        </Animate>
      </div>
    </PageContainer>
  );
}
