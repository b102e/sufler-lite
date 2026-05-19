"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { transitionTo } from "@/lib/transition";
import { FlowStep, PrepData } from "@/components/call-prep/types";
import { CallProfile } from "@/lib/call-profile";
import ClarificationChat from "@/components/call-prep/ClarificationChat";
import CallSummaryReview from "@/components/call-prep/CallSummaryReview";

const emptyPrepData: PrepData = {
  name: "",
  organization: "",
  goal: "",
  details: "",
};

type ReviewData = Pick<PrepData, "name" | "organization" | "goal" | "details">;

export default function NewCallPage() {
  const router = useRouter();
  const [micBlocked, setMicBlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const pendingDataRef = useRef<{ finalPrep: PrepData; sessionId: string } | null>(null);
  const retryCountRef = useRef(0);

  function handleClarificationComplete(profile: CallProfile) {
    const extraDetails = [profile.required_identity, profile.important_numbers, profile.notes]
      .filter(Boolean)
      .map(v => (typeof v === "string" ? v : JSON.stringify(v)))
      .join("\n");

    const finalPrep: PrepData = {
      name: profile.caller_name ?? "",
      organization: profile.organization ?? "",
      goal: profile.call_goal ?? "",
      details: extraDetails,
    };

    // Write to sessionStorage synchronously before proceeding
    const sessionId = uuidv4();
    try {
      sessionStorage.setItem(`session:${sessionId}`, JSON.stringify({
        ...finalPrep,
        caller_name: finalPrep.name,
        call_goal: finalPrep.goal,
        notes: finalPrep.details,
      }));
    } catch { /* ignore */ }

    pendingDataRef.current = { finalPrep, sessionId };
    checkMicAndProceed(finalPrep, sessionId);
  }

  async function checkMicAndProceed(finalPrep: PrepData, sessionId: string) {
    setChecking(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      // Permission granted — navigate
      transitionTo(() => router.push(`/call/${sessionId}`));
    } catch {
      retryCountRef.current += 1;
      setMicBlocked(true);
      setChecking(false);
    }
  }


  function handleRetryMic() {
    const pending = pendingDataRef.current;
    if (!pending) return;
    setMicBlocked(false);
    checkMicAndProceed(pending.finalPrep, pending.sessionId);
  }

  if (micBlocked) {
    const showSettingsHint = retryCountRef.current > 1;
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center bg-cb-bg">
        <div className="mb-6">
          <div className="w-14 h-14 rounded-full bg-cb-dark-gray flex items-center justify-center mx-auto mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cb-muted">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-cb-text mb-2">
            Нет доступа к микрофону
          </h2>
          <p className="text-sm text-cb-muted leading-relaxed">
            Суфлёр не может работать без доступа к микрофону.
            Разрешите доступ чтобы продолжить.
          </p>
          {showSettingsHint && (
            <p className="mt-3 text-xs text-cb-muted leading-relaxed">
              Если браузер уже заблокировал доступ — откройте настройки браузера
              и разрешите доступ к микрофону для этого сайта.
            </p>
          )}
        </div>

        <div className="w-full space-y-3">
          <button
            type="button"
            onClick={handleRetryMic}
            className="w-full h-14 rounded-2xl bg-cb-emerald text-cb-bg text-base font-medium hover:bg-cb-emerald-hover active:scale-[0.98] transition-all duration-150"
          >
            Разрешить доступ
          </button>
          <button
            type="button"
            onClick={() => transitionTo(() => router.push("/"))}
            className="w-full h-12 rounded-xl border border-cb-dark-gray text-sm font-medium text-cb-muted transition active:scale-[0.99]"
          >
            Вернуться в начало
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md min-h-screen">
      {checking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-cb-bg/90">
          <p className="text-sm text-cb-muted">Запрашиваем доступ к микрофону…</p>
        </div>
      )}
      <ClarificationChat
        initialDescription=""
        onComplete={handleClarificationComplete}
        onReset={() => transitionTo(() => router.push("/"))}
      />
    </main>
  );
}
