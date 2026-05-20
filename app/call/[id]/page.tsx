"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useCallSession } from "@/hooks/useCallSession";
import type { ChosenOption } from "@/lib/transcript";
import { SUGGEST_FALLBACK, type SuggestSingle, type HistoryEntry } from "@/lib/call-suggest";
import { transitionTo } from "@/lib/transition";
import TypingDots from "@/components/common/TypingDots";

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "user_turn" | "listening" | "generating" | "exit_options";

type SystemMsg      = { id: string; kind: "system";      text: string };
type CounterpartMsg = { id: string; kind: "counterpart"; text: string; isLive: boolean };
type UserMsg        = { id: string; kind: "user";        suggestion: SuggestSingle | null };
type ChatMsg = SystemMsg | CounterpartMsg | UserMsg;

type PrepSession = {
  name?: string; organization?: string; goal?: string; details?: string;
  caller_name?: string; call_goal?: string; required_identity?: string;
  important_numbers?: string; notes?: string;
};

// ── Hardcoded instant phrases ─────────────────────────────────────────────────

const DIDNT_HEAR: SuggestSingle = {
  russian: "Извините, не расслышал — можете повторить?",
  italian: "Scusi, non ho capito — può ripetere?",
  translit: "Скузи, нон о капито — пуо репетере?",
};

const EXIT_OPTIONS: SuggestSingle[] = [
  {
    russian: "Спасибо, до свидания!",
    italian: "Grazie, arrivederci!",
    translit: "ГРАцие, арривеДЭрчи!",
    is_farewell: true,
  },
  {
    russian: "Извините, у меня срочный звонок — перезвоню позже",
    italian: "Mi scusi, ho una chiamata urgente — la richiamo",
    translit: "Ми скузи, о уна кьямата урдженте — ла рикьямо",
  },
  {
    russian: "Извините, сейчас не могу говорить — перезвоню",
    italian: "Scusi, non posso parlare adesso — la richiamo",
    translit: "Скузи, нон поссо парларе адессо — ла рикьямо",
  },
  {
    russian: "Хорошо, спасибо — я перезвоню позже",
    italian: "Grazie, la richiamo più tardi",
    translit: "Грацие, ла рикьямо пью тарди",
  },
];

const MAX_TRANSCRIPT = 8;

const FILLER_PHRASES = [
  { it: "Allora...",      ru: "Так..." },
  { it: "Un momento...", ru: "Одну секунду..." },
  { it: "Sì, sì...",     ru: "Да, да..." },
  { it: "Capisco...",    ru: "Понимаю..." },
  { it: "Mmm...",        ru: "Мм..." },
  { it: "Certo...",      ru: "Конечно..." },
  { it: "Perfetto...",   ru: "Отлично..." },
  { it: "Va bene...",    ru: "Хорошо..." },
  { it: "Esatto...",     ru: "Именно..." },
  { it: "Dunque...",     ru: "Итак..." },
];

const uid = () => crypto.randomUUID();

// ── Component ─────────────────────────────────────────────────────────────────

export default function CallPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const sessionId = useRef(params.id).current;

  // Load prepSession synchronously — null means no valid session (expired/wrong device)
  const [prepSession] = useState<PrepSession | null>(() => {
    try {
      if (typeof window === "undefined") return null;
      const raw = sessionStorage.getItem(`session:${params.id}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const prepSessionRef = useRef<PrepSession>(prepSession ?? {});
  prepSessionRef.current = prepSession ?? {};

  const [readMode, setReadMode] = useState<"translit" | "italian">(() => {
    try { return (sessionStorage.getItem("sufler:readMode") as "translit" | "italian") ?? "italian"; }
    catch { return "italian"; }
  });
  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [exitPending, setExitPending] = useState(false);
  const [hasFinalText, setHasFinalText] = useState(false);
  const [currentFiller, setCurrentFiller] = useState<{ it: string; ru: string } | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const phaseRef             = useRef<Phase>("idle");
  const transcriptRef        = useRef<HistoryEntry[]>([]);
  const startedAtRef         = useRef(new Date().toISOString());
  const chosenOptionsRef     = useRef<ChosenOption[]>([]);
  const lastFinalTextRef     = useRef("");   // accumulated transcript:finals during listening
  const currentHeardTextRef  = useRef("");   // heard text for current generating/regenerate cycle
  const currentUserMsgIdRef  = useRef("");   // ID of the current right-side bubble
  const translateAbortRef    = useRef<AbortController | null>(null);
  const pendingTranslationUpdaters = useRef<Map<string, (t: string) => void>>(new Map());
  const autoStopTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDgFinalRef       = useRef("");  // dedup consecutive identical Deepgram finals
  const currentPartialRef    = useRef("");  // latest partial text (fallback if button pressed mid-recognition)
  const currentCounterpartId = useRef("");  // ID of active counterpart bubble
  const openingFetchedRef    = useRef(false);
  const bottomRef            = useRef<HTMLDivElement>(null);

  function updatePhase(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  function clearListeningTimers() {
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null; }
    if (silenceTimerRef.current)  { clearTimeout(silenceTimerRef.current);  silenceTimerRef.current  = null; }
  }

  async function fetchTranslation(msgId: string, text: string) {
    translateAbortRef.current?.abort();
    const controller = new AbortController();
    translateAbortRef.current = controller;

    setTranslations(prev => ({ ...prev, [msgId]: "..." }));
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!controller.signal.aborted) {
        const t = data.translation ?? "";
        setTranslations(prev => ({ ...prev, [msgId]: t }));
        if (t) {
          pendingTranslationUpdaters.current.get(msgId)?.(t);
          pendingTranslationUpdaters.current.delete(msgId);
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        setTranslations(prev => ({ ...prev, [msgId]: "" }));
      }
    }
  }

  const { startListening, stopListening, sendOptionChosen, sendSessionEnd } =
    useCallSession(sessionId);

  // ── API helper ────────────────────────────────────────────────────────────

  const callSuggestAPI = useCallback(async (
    heardText: string | null,
    msgId: string,
    regenerate = false,
  ): Promise<SuggestSingle> => {
    const prep = prepSessionRef.current;
    const callContext = [
      prep.caller_name ?? prep.name,
      prep.organization,
      prep.call_goal ?? prep.goal,
      prep.required_identity,
      prep.important_numbers,
      prep.notes ?? prep.details,
    ].filter(Boolean).join(" | ");

    // Filler phrase: show after 1600ms if Claude hasn't responded yet
    let fillerShown = false;
    const fillerTimer = setTimeout(() => {
      fillerShown = true;
      setCurrentFiller(FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)]);
    }, 1600);

    const clearFiller = () => {
      clearTimeout(fillerTimer);
      if (fillerShown) {
        setTimeout(() => setCurrentFiller(null), 200);
      } else {
        setCurrentFiller(null);
      }
    };

    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heard_text: heardText,
          call_context: callContext,
          history: transcriptRef.current.slice(-MAX_TRANSCRIPT),
          regenerate,
        }),
      });

      if (!res.body) { clearFiller(); return SUGGEST_FALLBACK; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let partial: SuggestSingle = { italian: "", russian: "", translit: "", is_farewell: false };
      let lastKey = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const italian  = buffer.match(/^ITALIAN: (.+)$/m)?.[1]?.trim()  ?? partial.italian;
        const russian  = buffer.match(/^RUSSIAN: (.+)$/m)?.[1]?.trim()  ?? partial.russian;
        const translit = buffer.match(/^TRANSLIT: (.+)$/m)?.[1]?.trim() ?? partial.translit;
        const farewell = buffer.match(/^FAREWELL: (true|false)$/m)?.[1] === "true";

        const key = `${italian}|${russian}|${translit}`;
        if (key !== lastKey && italian) {
          partial = { italian, russian, translit, is_farewell: farewell };
          lastKey = key;
          setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m as UserMsg, suggestion: { ...partial } } : m
          ));
        }
      }

      if (!partial.italian) {
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m as UserMsg, suggestion: SUGGEST_FALLBACK } : m
        ));
      }
      clearFiller();
      return partial.italian ? partial : SUGGEST_FALLBACK;
    } catch {
      clearFiller();
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m as UserMsg, suggestion: SUGGEST_FALLBACK } : m
      ));
      return SUGGEST_FALLBACK;
    }
  }, []);

  // ── Modal dismiss → fetch opening suggestion ──────────────────────────────

  // ── Fetch opening suggestion on mount ────────────────────────────────────

  useEffect(() => {
    if (openingFetchedRef.current) return;
    openingFetchedRef.current = true;
    const msgId = uid();
    currentUserMsgIdRef.current = msgId;
    setMessages(prev => [...prev, { id: msgId, kind: "user", suggestion: null }]);
    callSuggestAPI(null, msgId, false).then(() => updatePhase("user_turn"));
  }, [callSuggestAPI]);

  // ── Auto-scroll on new message or phase change ────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, phase]);

  // ── Auto-exit after 60s of inactivity in user_turn ───────────────────────

  useEffect(() => {
    if (phase !== "user_turn") return;
    const timer = setTimeout(doEndCall, 60_000);
    return () => clearTimeout(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleISaidIt(suggestion: SuggestSingle) {
    const opt: ChosenOption = {
      speaker: "user",
      optionText: suggestion.italian,
      optionIndex: chosenOptionsRef.current.length,
      chosenAt: new Date().toISOString(),
      translation: suggestion.russian || undefined,
    };
    chosenOptionsRef.current.push(opt);
    sendOptionChosen(suggestion.italian, opt.optionIndex);
    transcriptRef.current = [...transcriptRef.current, { role: "user", text: suggestion.italian }];

    // Auto-end on farewell phrase or explicit exit
    if (suggestion.is_farewell || exitPending) {
      doEndCall();
      return;
    }

    // Remove any trailing "silence" system messages before starting new listening cycle
    setMessages(prev => {
      let i = prev.length - 1;
      while (i >= 0 && prev[i].kind === "system") i--;
      return i < prev.length - 1 ? prev.slice(0, i + 1) : prev;
    });

    // Add live counterpart bubble and start mic
    const counterpartId = uid();
    lastFinalTextRef.current = "";
    lastDgFinalRef.current = "";
    currentPartialRef.current = "";
    currentCounterpartId.current = counterpartId;
    setHasFinalText(false);
    setMessages(prev => [...prev, { id: counterpartId, kind: "counterpart", text: "", isLive: true }]);
    updatePhase("listening");

    // Reset silence timer on any speech activity
    function resetSilenceTimer() {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (phaseRef.current !== "listening") return;
        // Counterpart already said something — let 30s auto-stop handle it
        if (lastFinalTextRef.current.trim()) return;
        clearListeningTimers();
        stopListening();
        setHasFinalText(false);
        lastFinalTextRef.current = "";
        // Remove empty counterpart bubble
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.kind === "counterpart" && !(last as CounterpartMsg).text.trim()) {
            return prev.slice(0, -1);
          }
          return prev;
        });
        setMessages(prev => [...prev, {
          id: uid(), kind: "system",
          text: "Собеседник молчит. Нажмите «Я это сказал» чтобы повторить фразу.",
        } as SystemMsg]);
        updatePhase("user_turn");
      }, 10_000);
    }
    resetSilenceTimer();

    // Auto-stop after 30 seconds — send whatever was captured
    autoStopTimerRef.current = setTimeout(() => {
      if (phaseRef.current === "listening") handleHeStopped();
    }, 30_000);

    startListening((text, isFinal) => {
      if (isFinal) {
        if (!text.trim()) return;
        // Skip exact duplicate finals (Deepgram repeats is_final with same text)
        if (text.trim() === lastDgFinalRef.current) return;
        lastDgFinalRef.current = text.trim();
        // Deepgram sends cumulative text per is_final — check if new text already
        // includes previous finals to avoid duplication
        const prev = lastFinalTextRef.current;
        const isCumulative = prev && text.trim().startsWith(prev.trim());
        lastFinalTextRef.current = isCumulative ? text.trim() : (prev ? prev + " " + text.trim() : text.trim());

        setHasFinalText(true);
        resetSilenceTimer();
        const accumulated = lastFinalTextRef.current;
        setMessages(prev => prev.map(m => {
          if (m.id !== counterpartId) return m;
          // Set bubble directly from accumulated ref — never append existing bubble text
          return { ...m as CounterpartMsg, text: accumulated, isLive: false };
        }));
        fetchTranslation(counterpartId, accumulated);
      } else {
        if (text.trim()) {
          setHasFinalText(true);
          resetSilenceTimer();
          const base = lastFinalTextRef.current;
          currentPartialRef.current = base ? base + " " + text.trim() : text.trim();
        }
        setMessages(prev => prev.map(m => {
          if (m.id !== counterpartId) return m;
          const base = lastFinalTextRef.current;
          return {
            ...m as CounterpartMsg,
            text: base ? base + " " + text : text,
            isLive: true,
          };
        }));
      }
    });
  }

  function handleHeStopped() {
    clearListeningTimers();
    stopListening();
    // Use final text if available; fall back to last partial if button pressed mid-recognition
    const heardText = lastFinalTextRef.current || currentPartialRef.current;
    currentHeardTextRef.current = heardText;

    // If bubble is still isLive (no is_final arrived), finalize it and fetch translation
    const cid = currentCounterpartId.current;
    if (cid && currentPartialRef.current && !lastFinalTextRef.current) {
      setMessages(prev => prev.map(m =>
        m.id === cid ? { ...m as CounterpartMsg, isLive: false } : m
      ));
      fetchTranslation(cid, currentPartialRef.current);
    }

    lastFinalTextRef.current = "";
    currentPartialRef.current = "";
    currentCounterpartId.current = "";

    if (heardText) {
      transcriptRef.current = [...transcriptRef.current, { role: "counterpart", text: heardText }];
      const counterpartOpt: ChosenOption = {
        speaker: "counterpart",
        optionText: heardText,
        optionIndex: -1,
        chosenAt: new Date().toISOString(),
      };
      const optIdx = chosenOptionsRef.current.length;
      chosenOptionsRef.current.push(counterpartOpt);
      // Register updater so fetchTranslation can write translation into the ref
      pendingTranslationUpdaters.current.set(cid, (t: string) => {
        if (chosenOptionsRef.current[optIdx]) {
          chosenOptionsRef.current[optIdx] = { ...chosenOptionsRef.current[optIdx], translation: t };
        }
      });
      sendOptionChosen(heardText, -1); // -1 marks counterpart entry in SQLite
    }

    const msgId = uid();
    currentUserMsgIdRef.current = msgId;
    setMessages(prev => [...prev, { id: msgId, kind: "user", suggestion: null }]);
    updatePhase("generating");

    callSuggestAPI(heardText || null, msgId, false).then(() => updatePhase("user_turn"));
  }

  function handleRegenerate() {
    const msgId = currentUserMsgIdRef.current;
    if (!msgId) return;
    updatePhase("generating");
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m as UserMsg, suggestion: null } : m
    ));
    callSuggestAPI(currentHeardTextRef.current || null, msgId, true).then(() => updatePhase("user_turn"));
  }

  function handleDidntHear() {
    const msgId = currentUserMsgIdRef.current;
    if (!msgId) return;
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m as UserMsg, suggestion: DIDNT_HEAR } : m
    ));
    // Stay in user_turn, "Я это сказал" remains available
  }

  function handleUrgentExit() {
    clearListeningTimers();
    stopListening();
    lastFinalTextRef.current = "";
    setHasFinalText(false);
    // Remove live/partial counterpart bubble if present
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.kind === "counterpart" && (last as CounterpartMsg).isLive) {
        return prev.slice(0, -1);
      }
      return prev;
    });
    updatePhase("exit_options");
  }

  function handleSelectExitOption(opt: SuggestSingle) {
    const msgId = currentUserMsgIdRef.current;
    if (!msgId) return;
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m as UserMsg, suggestion: opt } : m
    ));
    setExitPending(true);
    updatePhase("user_turn");
  }

  function doEndCall() {
    clearListeningTimers();
    stopListening();
    sendSessionEnd();
    const endedAt = new Date().toISOString();
    try {
      sessionStorage.setItem("sufler:result", JSON.stringify({
        sessionId,
        organization: prepSessionRef.current.organization ?? null,
        goal: prepSessionRef.current.goal ?? prepSessionRef.current.call_goal ?? null,
        startedAt: startedAtRef.current,
        endedAt,
        chosenOptions: chosenOptionsRef.current,
      }));
    } catch { /* ignore */ }
    transitionTo(() => router.push("/"));
  }

  // ── Expired session guard ─────────────────────────────────────────────────

  if (prepSession === null) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl mb-6">🔒</p>
        <h1 className="text-lg font-semibold text-cb-text mb-2">Сессия недоступна</h1>
        <p className="text-sm text-cb-muted leading-relaxed mb-8">
          Эта ссылка устарела или была открыта на другом устройстве.
          Данные звонка хранятся только в браузере, где был подготовлен звонок.
        </p>
        <button
          type="button"
          onClick={() => transitionTo(() => router.replace("/"))}
          className="h-12 px-8 rounded-xl bg-cb-emerald text-sm font-semibold text-cb-bg transition active:scale-[0.99]"
        >
          На главную
        </button>
      </main>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Find the current user suggestion for buttons
  const lastMsg = messages[messages.length - 1];
  const currentSuggestion = lastMsg?.kind === "user" ? lastMsg.suggestion : null;

  // Locked until counterpart's first transcript:final arrives in current listening cycle
  const buttonsLocked = phase === "listening" && !hasFinalText;

  const isCurrentUserMsg = (id: string) =>
    id === currentUserMsgIdRef.current &&
    (phase === "user_turn" || phase === "listening" || phase === "exit_options");

  const org = prepSession.organization || "организацию";

  return (
    <main className="mx-auto flex h-screen w-full max-w-md flex-col">

      {/* Fixed header */}
      <header className="shrink-0 px-4 pt-8 pb-4 border-b border-cb-dark-gray flex items-center justify-between">
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
        <button
          type="button"
          onClick={doEndCall}
          className="text-xs text-red-400/50 hover:text-red-400/80 transition-colors duration-200"
        >
          ✕ Выйти из суфлёра
        </button>
      </header>

      {/* Scrollable chat — pb accounts for fixed footer */}
      <div className="relative flex-1 overflow-y-auto px-4 py-5 space-y-3">

        {messages.length <= 1 && phase === "listening" && (
          <p className="text-sm text-cb-muted text-center py-8">Ждём собеседника...</p>
        )}

        {messages.map((msg) => {
          if (msg.kind === "system") {
            return (
              <p key={msg.id} className="text-xs text-cb-muted italic leading-relaxed text-center px-2 py-1">
                {msg.text}
              </p>
            );
          }

          if (msg.kind === "counterpart") {
            const translation = translations[msg.id];
            return (
              <div key={msg.id} className="flex justify-start pl-1 anim-bubble-l">
                <div className="max-w-[80%] border-l-2 border-cb-dark-gray pl-3 transition-colors duration-200">
                  {msg.text ? (
                    <>
                      <p className={`text-[14px] leading-relaxed ${msg.isLive ? "text-cb-muted italic" : "text-cb-text"}`}>
                        {msg.text}
                      </p>
                      {!msg.isLive && translation !== undefined && translation !== "" && (
                        <p className="text-[12px] italic text-cb-muted mt-1 leading-relaxed">
                          {translation}
                        </p>
                      )}
                    </>
                  ) : (
                    <TypingDots />
                  )}
                </div>
              </div>
            );
          }

          // User message (right) — buttons live inside the bubble for the current message
          const isCurrent = isCurrentUserMsg(msg.id);
          const suggestion = msg.suggestion;

          return (
            <div key={msg.id} className="flex justify-end anim-bubble-r">
              <div className="w-[92%] rounded-2xl rounded-tr-sm border border-cb-dark-gray bg-cb-card px-4 py-4">
                {suggestion === null ? (
                  <TypingDots />
                ) : (
                  <>
                    {readMode === "translit" ? (
                      <>
                        <p className="text-[22px] font-bold text-cb-text leading-snug">
                          {suggestion.translit}
                        </p>
                        <p className="text-[13px] italic text-cb-muted leading-snug mt-2">
                          {suggestion.russian}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[22px] font-bold text-cb-emerald leading-snug">
                          {suggestion.italian}
                        </p>
                        <p className="text-[13px] italic text-cb-muted leading-snug mt-2">
                          {suggestion.russian}
                        </p>
                      </>
                    )}

                    {/* Buttons — only in user_turn, only last bubble */}
                    {isCurrent && phase === "user_turn" && !exitPending && (
                      <div className="mt-4 pt-3 border-t border-cb-dark-gray">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleISaidIt(suggestion)}
                            className="h-10 rounded-xl bg-cb-emerald text-[13px] font-semibold text-cb-bg transition-all duration-150 hover:scale-[1.02] active:scale-[0.96] anim-fade-up-fast"
                            style={{ animationDelay: "0ms" }}
                          >
                            Я это сказал
                          </button>
                          <button
                            type="button"
                            onClick={handleRegenerate}
                            className="h-10 rounded-xl bg-cb-dark-gray text-[13px] text-cb-text border border-cb-emerald/30 transition-all duration-150 hover:scale-[1.01] hover:border-cb-emerald active:scale-[0.99] anim-fade-up-fast"
                            style={{ animationDelay: "40ms" }}
                          >
                            Другой вариант
                          </button>
                          <button
                            type="button"
                            onClick={handleDidntHear}
                            className="h-10 rounded-xl bg-cb-orange/20 text-[13px] text-cb-orange border border-cb-orange/40 transition-all duration-150 hover:bg-cb-orange hover:text-cb-bg hover:scale-[1.01] active:scale-[0.99] anim-fade-up-fast"
                            style={{ animationDelay: "80ms" }}
                          >
                            Не расслышал
                          </button>
                          <button
                            type="button"
                            onClick={handleUrgentExit}
                            className="h-10 rounded-xl bg-cb-dark-gray text-[13px] text-cb-text border border-cb-emerald/30 transition-all duration-150 hover:scale-[1.01] hover:border-cb-emerald active:scale-[0.99] anim-fade-up-fast"
                            style={{ animationDelay: "120ms" }}
                          >
                            Завершить
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Exit pending — only "Я это сказал" */}
                    {isCurrent && phase === "user_turn" && exitPending && (
                      <div className="mt-4 pt-3 border-t border-cb-dark-gray">
                        <button
                          type="button"
                          onClick={() => handleISaidIt(suggestion)}
                          className="w-full h-10 rounded-xl bg-cb-emerald text-[13px] font-semibold text-cb-bg transition active:scale-[0.99]"
                        >
                          Я это сказал
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Filler phrase while Claude is generating */}
        {phase === "generating" && currentFiller && (
          <div className="rounded-xl border border-cb-dark-gray bg-cb-card px-4 py-3 anim-fade-up">
            <p className="text-[11px] uppercase tracking-widest text-cb-muted mb-1">Скажите пока:</p>
            <p className="text-[18px] font-semibold text-cb-emerald leading-snug">{currentFiller.it}</p>
            <p className="text-[13px] italic text-cb-muted mt-0.5">{currentFiller.ru}</p>
          </div>
        )}

        {/* Listening controls — two buttons */}
        {phase === "listening" && (
          <div className="space-y-2 anim-fade-up">
            <button
              type="button"
              onClick={handleHeStopped}
              disabled={!hasFinalText}
              className={`w-full py-3 rounded-xl border border-cb-dark-gray bg-cb-dark-gray text-sm font-medium text-cb-text transition-all duration-200 active:scale-[0.97] flex items-center justify-center gap-2 ${!hasFinalText ? "opacity-40 cursor-not-allowed" : "hover:bg-cb-elevated"}`}
            >
              <span className="w-2 h-2 rounded-full bg-cb-emerald animate-pulse shrink-0" />
              Собеседник закончил фразу
            </button>
            <button
              type="button"
              onClick={handleUrgentExit}
              className="w-full py-2 rounded-xl bg-cb-red/20 text-sm text-cb-red border border-cb-red/40 transition-all duration-150 hover:bg-cb-red hover:text-cb-bg hover:border-cb-red/40 active:scale-[0.99]"
            >
              Срочно завершить разговор
            </button>
          </div>
        )}

        {/* Blur overlay when exit options open */}
        {phase === "exit_options" && (
          <div className="absolute inset-0 bg-cb-bg/60 backdrop-blur-sm z-10 pointer-events-none transition-all duration-300" />
        )}

        {/* Exit phrase picker */}
        {phase === "exit_options" && (
          <div className="space-y-2 pt-1 anim-fade-up relative z-20">
            <p className="text-xs text-cb-muted text-center">Выберите фразу для завершения</p>
            {EXIT_OPTIONS.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectExitOption(opt)}
                className="w-full text-left rounded-xl border border-cb-dark-gray bg-cb-card px-4 py-3 transition active:scale-[0.99] hover:border-cb-emerald"
              >
                <p className="text-sm text-cb-text leading-snug">{opt.russian}</p>
                <p className="text-xs text-cb-muted mt-0.5">{opt.italian}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => updatePhase("user_turn")}
              className="w-full h-9 text-xs text-cb-muted transition hover:text-cb-text"
            >
              Назад
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>


    </main>
  );
}
