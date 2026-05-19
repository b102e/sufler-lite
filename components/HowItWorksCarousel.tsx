"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

const TOTAL = 4;
const INTERVAL = 3000;

export default function HowItWorksCarousel({ className = "" }: { className?: string }) {
  const [current, setCurrent] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const goTo = useCallback(async (index: number) => {
    setIsVisible(false);
    await new Promise(r => setTimeout(r, 200));
    setCurrent(index);
    setIsVisible(true);
  }, []);

  const next = useCallback(() => {
    goTo((current + 1) % TOTAL);
  }, [current, goTo]);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(next, INTERVAL);
    return () => clearInterval(timer);
  }, [next, isPaused]);

  return (
    <div
      className={`w-full max-w-[480px] mx-auto ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Image */}
      <div
        className="relative w-full cursor-pointer rounded-2xl overflow-hidden"
        style={{ paddingBottom: "66%" }}
        onClick={() => goTo((current + 1) % TOTAL)}
      >
        {/* Arrows — desktop only */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goTo((current - 1 + TOTAL) % TOTAL); }}
          className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/40 rounded-full p-1.5 text-white items-center justify-center"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goTo((current + 1) % TOTAL); }}
          className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/40 rounded-full p-1.5 text-white items-center justify-center"
        >
          ›
        </button>

        <div
          style={{ opacity: isVisible ? 1 : 0, transition: "opacity 200ms ease" }}
          className="absolute inset-0"
        >
          <Image
            src={`/how-it-works/${current + 1}.jpg`}
            alt={`Шаг ${current + 1}`}
            fill
            className="object-cover"
            priority={current === 0}
          />
        </div>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 mt-3">
        {Array.from({ length: TOTAL }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === current
                ? "w-4 bg-[#00D4A5]"
                : "w-2 bg-gray-500 opacity-50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
