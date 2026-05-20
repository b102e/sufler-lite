"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { transitionTo } from "@/lib/transition";
import { downloadTranscript, formatDateTime, type ChosenOption, type SessionForTranscript } from "@/lib/transcript";
import HeroScreen from "@/components/HeroScreen";

type ResultData = {
  sessionId: string;
  organization: string | null;
  goal: string | null;
  startedAt: string;
  endedAt: string;
  chosenOptions: ChosenOption[];
};


const HOW_STEPS = [
  "Подготовьте информацию о звонке с помощью ИИ",
  "Позвоните с другого устройства",
  "Включите громкую связь и положите телефон рядом",
  "Суфлер слушает и подсказывает фразы в реальном времени",
];

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-md bg-zinc-900 rounded-t-3xl px-6 pt-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-8 h-1 bg-zinc-700 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-semibold text-zinc-100 mb-6">Как это работает</h2>

        <ol className="space-y-4 mb-8">
          {HOW_STEPS.map((step, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="shrink-0 w-6 h-6 rounded-full border border-zinc-600 text-xs text-zinc-400 flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-zinc-300 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="w-full h-14 rounded-2xl bg-zinc-100 text-base font-semibold text-zinc-900 transition active:scale-[0.99]"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

const LANGUAGES = [
  { flag: "🇮🇹", name: "Итальянский", active: true },
  { flag: "🇪🇸", name: "Испанский",     active: false },
  { flag: "🇫🇷", name: "Французский",   active: false },
  { flag: "🇩🇪", name: "Немецкий",      active: false },
  { flag: "🇬🇧", name: "Английский",    active: false },
  { flag: "🇵🇹", name: "Португальский", active: false },
  { flag: "🇳🇱", name: "Нидерландский", active: false },
  { flag: "🇵🇱", name: "Польский",      active: false },
  { flag: "🇨🇿", name: "Чешский",       active: false },
  { flag: "🇷🇴", name: "Румынский",     active: false },
  { flag: "🇬🇷", name: "Греческий",     active: false },
  { flag: "🇹🇷", name: "Турецкий",      active: false },
  { flag: "🇸🇦", name: "Арабский",      active: false },
  { flag: "🇯🇵", name: "Японский",      active: false },
  { flag: "🇰🇷", name: "Корейский",     active: false },
  { flag: "🇨🇳", name: "Китайский",     active: false },
  { flag: "🇮🇳", name: "Хинди",         active: false },
  { flag: "🇸🇪", name: "Шведский",      active: false },
  { flag: "🇺🇦", name: "Украинский",    active: false },
  { flag: "🇫🇮", name: "Финский",       active: false },
];

export default function HomePage() {
  const router = useRouter();
  const [result, setResult] = useState<ResultData | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [showLangs, setShowLangs] = useState(false);
  const [toast, setToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast() {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(true);
    toastTimerRef.current = setTimeout(() => setToast(false), 1500);
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("sufler:result");
      if (raw) {
        sessionStorage.removeItem("sufler:result"); // delete immediately — refresh shows clean state
        setResult(JSON.parse(raw));
      }
    } catch { /* ignore */ }
  }, []);

  function handleDownload() {
    if (!result) return;
    const session: SessionForTranscript = {
      id: result.sessionId,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      status: "completed",
      taskContext: [result.organization, result.goal].filter(Boolean).join(" — ") || null,
      createdAt: result.startedAt,
      chosenOptions: result.chosenOptions,
    };
    downloadTranscript(session);
  }

  if (result) {
    return (
      <main className="mx-auto flex h-screen w-full max-w-md flex-col px-4 pt-8 pb-6 overflow-hidden bg-cb-bg">

        <header className="shrink-0 mb-4">
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
        </header>

        <article className="flex-1 min-h-0 flex flex-col rounded-2xl border border-cb-dark-gray bg-cb-card p-5 mb-4">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <p className="text-xs uppercase tracking-widest text-cb-muted">Разговор</p>
            <span className="text-xs text-cb-muted">{formatDateTime(result.startedAt)}</span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {result.chosenOptions.length === 0 ? (
              <p className="text-sm text-cb-muted italic">(Реплики не выбраны)</p>
            ) : (
              <div className="space-y-0 pb-2">
                {result.chosenOptions.map((opt, i) => (
                  <div
                    key={i}
                    className={`border-l-2 pl-3 pb-3 mb-3 border-b border-cb-dark-gray last:border-b-0 last:mb-0 anim-fade-up ${opt.speaker === "counterpart" ? "border-l-cb-dark-gray" : "border-l-cb-emerald"}`}
                    style={{ animationDelay: `${Math.min(i * 60, 500)}ms` }}
                  >
                    <p className={`text-[11px] uppercase tracking-wide font-medium mb-0.5 ${opt.speaker === "counterpart" ? "text-cb-muted" : "text-cb-emerald"}`}>
                      {opt.speaker === "counterpart" ? "Собеседник" : "Вы"}
                    </p>
                    <p className="text-sm text-cb-text leading-relaxed">{opt.optionText}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 mt-4 border-t border-cb-dark-gray pt-4">
            <button
              type="button"
              onClick={handleDownload}
              className="w-full h-10 rounded-xl border border-cb-dark-gray text-xs font-medium text-cb-muted transition-all duration-150 active:scale-[0.99] hover:border-cb-emerald hover:text-cb-text anim-fade-up"
              style={{ animationDelay: `${Math.min(result.chosenOptions.length * 60 + 100, 600)}ms` }}
            >
              Скачать транскрипт
            </button>
          </div>
        </article>

        <button
          type="button"
          onClick={() => setResult(null)}
          className="shrink-0 flex h-14 w-full items-center justify-center rounded-xl bg-cb-emerald text-cb-bg text-base font-medium transition-all duration-150 hover:bg-cb-emerald-hover active:scale-[0.98]"
        >
          Выйти
        </button>

      </main>
    );
  }

  // ── Start screen ───────────────────────────────────────────────────────────

  return (
    <HeroScreen onStart={() => transitionTo(() => router.push("/call/new"))} />
  );
}
