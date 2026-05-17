"use client";

import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from "react";
import { BudgetState, CallProfile, ChatApiResponse, ChatTurn, emptyProfile } from "@/lib/call-profile";
import TypingDots from "@/components/common/TypingDots";

const MAX_USER_MESSAGES = 10;
const NEAR_BOTTOM_THRESHOLD = 80; // px from bottom

type UIMessage = { role: "user" | "assistant"; text: string };

type Props = {
  initialDescription: string;
  onComplete: (profile: CallProfile) => void;
  onReset: () => void;
};

export default function ClarificationChat({ initialDescription, onComplete, onReset }: Props) {
  const [uiMessages, setUiMessages] = useState<UIMessage[]>([]);
  const [apiMessages, setApiMessages] = useState<ChatTurn[]>([]);
  const [profile, setProfile] = useState<CallProfile>(emptyProfile);
  const [isReady, setIsReady] = useState(false);
  const [budget, setBudget] = useState<BudgetState>({ user_message_count: 0, is_near_limit: false, is_hard_limit: false });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  // One-time init guard (React 18 Strict Mode double-invoke)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetchNextMessage([]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll only when already near bottom
  useEffect(() => {
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [uiMessages, loading, isNearBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distFromBottom < NEAR_BOTTOM_THRESHOLD);
  }, []);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsNearBottom(true);
  }

  async function fetchNextMessage(messages: ChatTurn[]) {
    if (isReady) return;
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          initial_description: initialDescription,
          current_profile: profile,
        }),
      });
      if (!res.ok) throw new Error("API error");
      const data: ChatApiResponse = await res.json();

      // If model says ready but still wrote a question — sanitize the message
      const displayMessage =
        data.is_ready_for_call && data.assistant_message.trimEnd().endsWith("?")
          ? "Готово. Можно переходить к звонку."
          : data.assistant_message;

      setApiMessages([...messages, { role: "assistant", content: displayMessage }]);
      setProfile(data.profile);
      setIsReady(data.is_ready_for_call);
      if (data.budget) setBudget(data.budget);
      setUiMessages((prev) => [...prev, { role: "assistant", text: displayMessage }]);
      if (!data.is_ready_for_call) {
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    } catch {
      setUiMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Произошла ошибка. Попробуйте написать ещё раз." },
      ]);
      setTimeout(() => inputRef.current?.focus(), 80);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading || budget.is_hard_limit || isReady) return;

    const userTurn: ChatTurn = { role: "user", content: trimmed };
    const nextMessages = [...apiMessages, userTurn];

    setUiMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setApiMessages(nextMessages);
    setInput("");
    fetchNextMessage(nextMessages);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const userMessageCount = useMemo(
    () => uiMessages.filter((m) => m.role === "user").length,
    [uiMessages],
  );
  const remaining = Math.max(0, MAX_USER_MESSAGES - userMessageCount);

  return (
    // fixed inset-0 prevents body scroll entirely; chat is self-contained
    <div className="fixed inset-0 flex flex-col bg-zinc-950 anim-page">
      <div className="mx-auto w-full max-w-md flex flex-col h-full">

        {/* Header */}
        <header className="px-4 pt-10 pb-3 border-b border-zinc-800 shrink-0">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Суфлер</p>
          <div className="flex items-baseline justify-between mt-1">
            <h1 className="text-lg font-semibold text-zinc-100">Подготовка звонка</h1>
            {remaining <= 5 && remaining > 0 && !isReady && (
              <p className="text-xs text-zinc-500">
                {remaining <= 2 ? "Почти готово" : `Осталось уточнений: ${remaining}`}
              </p>
            )}
          </div>
        </header>

        {/* Scrollable messages area */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto px-4 py-5 space-y-3"
          >
            {uiMessages.map((msg, i) => (
              <div key={i} className={`flex anim-fade-up ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "assistant"
                      ? "bg-zinc-800 text-gray-200 rounded-tl-sm"
                      : "bg-zinc-600 text-white rounded-tr-sm"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3.5">
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Scroll-to-bottom button */}
          {!isNearBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-3 right-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs px-3 py-1.5 rounded-full transition active:scale-95"
              aria-label="Прокрутить вниз"
            >
              ↓
            </button>
          )}
        </div>

        {/* Sticky input area */}
        <div className="shrink-0 border-t border-zinc-800 px-4 pt-4 pb-8">
          {isReady ? (
            <button
              type="button"
              onClick={() => onComplete(profile)}
              className="w-full h-14 rounded-2xl bg-zinc-100 text-base font-semibold text-zinc-900 transition active:scale-[0.99]"
            >
              Далее
            </button>
          ) : budget.is_hard_limit ? (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400 text-center leading-relaxed">
                Недостаточно информации для подготовки звонка.
                <br />Попробуйте описать ситуацию короче и конкретнее.
              </p>
              <button
                type="button"
                onClick={onReset}
                className="w-full h-12 rounded-xl border border-zinc-700 text-sm font-medium text-zinc-300 transition active:scale-[0.99]"
              >
                Начать заново
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Введите ответ"
                disabled={loading}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 pr-12 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-40"
              />
              {input.trim() && !loading && (
                <button
                  type="button"
                  onClick={handleSend}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-100 text-zinc-900 transition active:scale-95"
                  aria-label="Отправить"
                >
                  ↑
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

