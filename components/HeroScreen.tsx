"use client";

import Image from "next/image";
import HowItWorksCarousel from "@/components/HowItWorksCarousel";

type Props = {
  onStart?: () => void;
  className?: string;
};

export default function HeroScreen({ onStart, className = "" }: Props) {
  return (
    <div className={`min-h-screen bg-cb-bg flex flex-col items-center justify-center px-6 pb-10 ${className}`}>
      <div className="w-full max-w-sm flex flex-col items-center">

        <div className="flex items-center justify-between px-4 pt-8 pb-6 w-full">
          <Image
            src="/logo.png"
            alt="Суфлёр"
            height={32}
            width={110}
            className="object-contain"
            style={{ background: "transparent" }}
            unoptimized
            priority
          />
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 240" className="h-6 w-auto" aria-label="Итальянская версия">
            <defs>
              <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00C853"/>
                <stop offset="50%" stopColor="#ffffff"/>
                <stop offset="100%" stopColor="#E53935"/>
              </linearGradient>
              <filter id="borderGlow" x="-10%" y="-30%" width="120%" height="160%">
                <feGaussianBlur stdDeviation="6" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2ECC71"/>
                <stop offset="38%" stopColor="#2ECC71"/>
                <stop offset="50%" stopColor="#ffffff"/>
                <stop offset="62%" stopColor="#ffffff"/>
                <stop offset="75%" stopColor="#E53935"/>
                <stop offset="100%" stopColor="#E53935"/>
              </linearGradient>
              <filter id="textGlow" x="-5%" y="-20%" width="110%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <linearGradient id="pillFill" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#001a00" stopOpacity="0.85"/>
                <stop offset="50%" stopColor="#111111" stopOpacity="0.9"/>
                <stop offset="100%" stopColor="#1a0000" stopOpacity="0.85"/>
              </linearGradient>
            </defs>
            <rect x="18" y="18" width="1164" height="204" rx="102" ry="102" fill="url(#pillFill)"/>
            <rect x="18" y="18" width="1164" height="204" rx="102" ry="102" fill="none" stroke="url(#borderGrad)" strokeWidth="5" filter="url(#borderGlow)" opacity="0.9"/>
            <rect x="18" y="18" width="1164" height="204" rx="102" ry="102" fill="none" stroke="url(#borderGrad)" strokeWidth="2.5" opacity="1"/>
            <text x="600" y="126" textAnchor="middle" dominantBaseline="middle" fontFamily="'Segoe UI', 'Helvetica Neue', Arial, sans-serif" fontSize="80" fontWeight="700" letterSpacing="2" fill="url(#textGrad)" filter="url(#textGlow)">Итальянская версия</text>
          </svg>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-cb-text text-center">
          Звони в Италии даже с нулевым итальянским
        </h1>

        <p className="text-base text-cb-muted text-center mt-3 max-w-xs mx-auto">
          Суфлёр подскажет фразу - ты просто читаешь вслух.
        </p>

        <HowItWorksCarousel className="mt-6 mb-2" />

        <button
          type="button"
          onClick={onStart}
          className="w-full bg-cb-emerald text-cb-bg rounded-2xl py-4 text-base font-medium mt-6 hover:bg-cb-emerald-hover active:scale-[0.98] transition-all duration-150"
        >
          Новый звонок →
        </button>

      </div>
    </div>
  );
}
