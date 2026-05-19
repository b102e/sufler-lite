"use client";

import Image from "next/image";
import HowItWorksCarousel from "@/components/HowItWorksCarousel";

type Props = {
  onStart?: () => void;
  className?: string;
};

export default function HeroScreen({ onStart, className = "" }: Props) {
  return (
    <div className={`min-h-screen bg-cb-bg flex flex-col items-center justify-center px-6 ${className}`}>
      <div className="w-full max-w-sm flex flex-col items-center">

        <div className="flex justify-center pt-6 pb-2">
          <Image
            src="/logo.png"
            alt="Суфлёр"
            height={36}
            width={66}
            className="object-contain"
            priority
          />
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
