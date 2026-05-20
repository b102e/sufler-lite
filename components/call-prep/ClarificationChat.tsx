"use client";

import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from "react";
import Image from "next/image";
import { BudgetState, CallProfile, ChatApiResponse, ChatTurn, emptyProfile } from "@/lib/call-profile";
import TypingDots from "@/components/common/TypingDots";

const MAX_USER_MESSAGES = 10;
const NEAR_BOTTOM_THRESHOLD = 80; // px from bottom

type UIMessage =
  | { role: "user" | "assistant"; text: string }
  | { role: "reading-question" }
  | { role: "ready-message" }
  | { role: "instruction"; organization: string; goal: string };

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
  const [readingStep, setReadingStep] = useState<"idle" | "asking" | "answered">("idle");
  const [selectedReadMode, setSelectedReadMode] = useState<"translit" | "italian" | null>(null);

  // Inline editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editorName, setEditorName] = useState("");
  const [editorOrg, setEditorOrg] = useState("");
  const [editorGoal, setEditorGoal] = useState("");
  const [editorDetails, setEditorDetails] = useState("");
  const [editedProfile, setEditedProfile] = useState<CallProfile | null>(null);
  const [verified, setVerified] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
      const rawMessage =
        data.is_ready_for_call && data.assistant_message.trimEnd().endsWith("?")
          ? "Готово. Можно переходить к звонку."
          : data.assistant_message;

      // Prepend intro only on the very first AI message
      const displayMessage = messages.length === 0
        ? `Привет! Давайте подготовимся к звонку. Я вам в этом помогу.\n\n${rawMessage.replace(/^Привет!\s*/i, "")}`
        : rawMessage;

      setApiMessages([...messages, { role: "assistant", content: displayMessage }]);
      setProfile(data.profile);
      if (data.budget) setBudget(data.budget);

      if (data.is_ready_for_call) {
        // Insert reading-question into the message stream (preserves order)
        setIsReady(true);
        setReadingStep("asking");
        setUiMessages(prev => [...prev, { role: "reading-question" as const }]);
      } else {
        setUiMessages((prev) => [...prev, { role: "assistant", text: displayMessage }]);
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

    // Guard against duplicate sends (double-tap, Enter + button click)
    const lastMsg = uiMessages[uiMessages.length - 1];
    if (lastMsg && "text" in lastMsg && lastMsg.role === "user" && lastMsg.text === trimmed) return;

    const userTurn: ChatTurn = { role: "user", content: trimmed };
    const nextMessages = [...apiMessages, userTurn];

    setUiMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setApiMessages(nextMessages);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    fetchNextMessage(nextMessages);
  }

  function handleReadModeSelect(mode: "translit" | "italian") {
    setSelectedReadMode(mode);
    try { sessionStorage.setItem("sufler:readMode", mode); } catch { /* ignore */ }
    setUiMessages(prev => [...prev, { role: "ready-message" as const }]);
    setTimeout(() => {
      setUiMessages(prev => [...prev, {
        role: "instruction" as const,
        organization: profile.organization ?? "",
        goal: profile.call_goal ?? "",
      }]);
    }, 700);
    setReadingStep("answered");
  }

  function openEditor() {
    const src = editedProfile ?? profile;
    setEditorName(src.caller_name ?? "");
    setEditorOrg(src.organization ?? "");
    setEditorGoal(src.call_goal ?? "");
    setEditorDetails(src.notes ?? "");
    setShowEditor(true);
  }

  function handleEditorSave() {
    const updated: CallProfile = {
      ...profile,
      caller_name: editorName.trim() || profile.caller_name,
      organization: editorOrg.trim() || profile.organization,
      call_goal: editorGoal.trim() || profile.call_goal,
      notes: editorDetails.trim() || profile.notes,
    };
    setEditedProfile(updated);
    setShowEditor(false);
    setVerified(true);
    setShowToast(true);
    setTimeout(() => {
      setVerified(false);
      setShowToast(false);
    }, 2000);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
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
    <div className="fixed inset-0 flex flex-col bg-cb-bg anim-page">
      <div className="mx-auto w-full max-w-md flex flex-col h-full">

        {/* Header */}
        <header className="px-4 pt-8 pb-3 border-b border-cb-dark-gray shrink-0 flex items-center justify-between">
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
          {remaining <= 5 && remaining > 0 && !isReady && (
            <p className="text-xs text-cb-muted">
              {remaining <= 2 ? "Почти готово" : `Осталось уточнений: ${remaining}`}
            </p>
          )}
        </header>

        {/* Scrollable messages area */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto px-4 py-5 space-y-3"
          >
            {uiMessages.map((msg, i) => {
              // Ready bubble with inline editor
              if (msg.role === "ready-message") {
                return (
                  <div key={i} className="flex justify-start anim-fade-up">
                    <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-cb-dark-gray px-4 py-4">
                      <p className="text-sm text-cb-text leading-relaxed">
                        Отлично. Готово — можно переходить к звонку.
                      </p>
                      {!verified ? (
                        <button
                          type="button"
                          onClick={openEditor}
                          className="mt-3 border border-cb-emerald/40 text-cb-muted text-sm rounded-lg px-3 py-1.5 hover:border-cb-emerald hover:text-cb-text transition-colors duration-150"
                        >
                          Проверить данные
                        </button>
                      ) : (
                        <span className="mt-3 block text-sm text-cb-emerald">✓ Данные проверены</span>
                      )}

                      {showEditor && (
                        <div className="mt-3 bg-cb-card border border-cb-dark-gray rounded-2xl p-4 space-y-3 anim-fade-up">
                          {[
                            { label: "Имя", val: editorName, set: setEditorName },
                            { label: "Организация", val: editorOrg, set: setEditorOrg },
                            { label: "Цель звонка", val: editorGoal, set: setEditorGoal },
                            { label: "Дополнительно", val: editorDetails, set: setEditorDetails },
                          ].map(({ label, val, set }) => (
                            <div key={label}>
                              <p className="text-cb-muted text-xs mb-1">{label}</p>
                              <input
                                type="text"
                                value={val}
                                onChange={e => set(e.target.value)}
                                className="bg-cb-elevated border border-cb-dark-gray rounded-xl px-3 py-2 text-cb-text w-full text-sm focus:border-cb-emerald outline-none transition-colors"
                              />
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setShowEditor(false)}
                              className="text-cb-muted text-sm px-3 py-2"
                            >
                              Отмена
                            </button>
                            <button
                              type="button"
                              onClick={handleEditorSave}
                              className="bg-cb-emerald text-cb-bg rounded-xl px-4 py-2 text-sm font-medium hover:bg-cb-emerald-hover transition-colors"
                            >
                              Сохранить
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Instruction card — styled as AI bubble
              if (msg.role === "instruction") {
                const { organization, goal } = msg;
                return (
                  <div key={i} className="flex justify-start anim-fade-up">
                    <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-cb-dark-gray px-4 py-4">
                      <div className="text-cb-text font-semibold text-base">{organization || "Звонок"}</div>
                      {goal && <div className="text-cb-muted text-sm mt-0.5 mb-3">{goal}</div>}
                      <div className="border-t border-cb-dark-gray mb-3" />
                      <div className="space-y-3 text-sm">
                        <div className="flex gap-2">
                          <span className="text-cb-emerald font-bold min-w-[20px]">1.</span>
                          <span className="text-cb-text">Позвоните в <strong>{organization || "организацию"}</strong> с отдельного телефона и поставьте его на <strong>громкую связь</strong>.</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-cb-emerald font-bold min-w-[20px]">2.</span>
                          <span className="text-cb-text">Положите телефон рядом с суфлёром — он будет слышать собеседника через микрофон.</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-cb-emerald font-bold min-w-[20px]">3.</span>
                          <span className="text-cb-text">Ваша первая фраза уже готова на следующем экране. Прочитайте её вслух когда вам ответят, затем нажмите <strong>«Я это сказал»</strong>.</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-cb-emerald font-bold min-w-[20px]">4.</span>
                          <span className="text-cb-text">Суфлёр услышит собеседника и предложит следующую фразу. Читайте вслух — нажимайте <strong>«Я это сказал»</strong>.</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-cb-orange font-bold min-w-[20px]">💡</span>
                          <span className="text-cb-muted">Не расслышали собеседника? Нажмите <strong className="text-cb-orange">«Не расслышал»</strong> — суфлёр даст фразу чтобы попросить повторить.</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-cb-orange font-bold min-w-[20px]">💡</span>
                          <span className="text-cb-muted">Разговор пошёл не так? Нажмите <strong className="text-cb-orange">«Срочно завершить»</strong> — получите вежливую фразу чтобы закончить звонок.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // Special reading-question bubble — rendered in correct stream position
              if (msg.role === "reading-question") {
                return (
                  <div key={i} className="flex justify-start anim-fade-up">
                    <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-cb-dark-gray px-4 py-4">
                      <p className="text-sm text-cb-text leading-relaxed mb-3">
                        Как вам удобнее читать фразы во время звонка?
                      </p>
                      <div className="space-y-2">
                        {(["translit", "italian"] as const).map((mode) => {
                          const isSelected = selectedReadMode === mode;
                          const isOther = selectedReadMode !== null && !isSelected;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => {
                                if (readingStep === "asking") {
                                  handleReadModeSelect(mode);
                                } else {
                                  setSelectedReadMode(mode);
                                  try { sessionStorage.setItem("sufler:readMode", mode); } catch { /* ignore */ }
                                }
                              }}
                              className={`w-full text-left rounded-xl p-3 border transition-all duration-200 ${
                                isSelected
                                  ? "border-cb-emerald bg-cb-elevated"
                                  : isOther
                                  ? "border-cb-dark-gray bg-cb-elevated opacity-40"
                                  : "border-cb-dark-gray bg-cb-elevated hover:border-cb-emerald/60"
                              }`}
                            >
                              <p className={`text-sm font-medium ${isSelected ? "text-cb-emerald" : "text-cb-text"}`}>
                                {mode === "translit" ? "Русскими буквами" : "На итальянском"}
                              </p>
                              <p className="text-xs text-cb-muted mt-1">
                                {mode === "translit"
                                  ? "буонджо́рно, ворре́й ордина́ре..."
                                  : "Buongiorno, vorrei ordinare..."}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className={`flex anim-fade-up ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "assistant"
                        ? "bg-cb-dark-gray text-cb-text rounded-tl-sm"
                        : "bg-cb-emerald text-cb-bg rounded-tr-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-cb-dark-gray rounded-2xl rounded-tl-sm px-4 py-3.5">
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
              className="absolute bottom-3 right-3 bg-cb-elevated hover:bg-cb-dark-gray text-cb-muted text-xs px-3 py-1.5 rounded-full transition active:scale-95"
              aria-label="Прокрутить вниз"
            >
              ↓
            </button>
          )}
        </div>

        {/* Sticky input area */}
        <div className="shrink-0 border-t border-cb-dark-gray px-4 pt-4 pb-8">
          {isReady && readingStep === "answered" ? (
            <button
              type="button"
              onClick={() => onComplete(editedProfile ?? profile)}
              className="w-full h-14 rounded-2xl bg-cb-emerald text-cb-bg text-base font-medium hover:bg-cb-emerald-hover active:scale-[0.98] transition-all duration-150"
            >
              Далее
            </button>
          ) : budget.is_hard_limit ? (
            <div className="space-y-3">
              <p className="text-xs text-cb-muted text-center leading-relaxed">
                Недостаточно информации для подготовки звонка.
                <br />Попробуйте описать ситуацию короче и конкретнее.
              </p>
              <button
                type="button"
                onClick={onReset}
                className="w-full h-12 rounded-xl border border-cb-dark-gray text-sm font-medium text-cb-muted transition active:scale-[0.99]"
              >
                Начать заново
              </button>
            </div>
          ) : (
            <div className="relative">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder="Введите ответ"
                disabled={loading}
                className="w-full rounded-xl border border-cb-dark-gray bg-cb-elevated px-4 py-3 pr-12 text-sm text-cb-text placeholder:text-cb-muted focus:border-cb-emerald focus:outline-none disabled:opacity-40 transition-colors duration-200 resize-none overflow-y-auto max-h-32"
              />
              {input.trim() && !loading && (
                <button
                  type="button"
                  onClick={handleSend}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-cb-emerald text-cb-bg transition active:scale-95"
                  aria-label="Отправить"
                >
                  ↑
                </button>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Toast */}
      {showToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-cb-emerald text-cb-bg text-sm font-medium px-4 py-2 rounded-xl shadow-lg anim-fade-up">
          Данные обновлены ✓
        </div>
      )}

    </div>
  );
}

