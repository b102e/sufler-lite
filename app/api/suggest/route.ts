import { NextRequest } from "next/server";
import { SuggestRequest, HistoryEntry, SUGGEST_FALLBACK } from "@/lib/call-suggest";
import { getAnthropicClient } from "@/lib/anthropic";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
import { sanitizeInput, sanitizeHistory } from "@/lib/sanitize";

const MAX_BODY_BYTES = 16_384; // 16 KB

const MODEL = "claude-haiku-4-5-20251001";
const MAX_HISTORY = 8;

function buildSystemPrompt(
  callContext: string,
  history: HistoryEntry[],
  heardText: string | null,
  regenerate: boolean
): string {
  const isOpening = history.length === 0 && !heardText;

  const historyText = history
    .slice(-MAX_HISTORY)
    .map(e => `${e.role === "user" ? "Пользователь" : "Собеседник"}: ${e.text}`)
    .join("\n");

  const taskBlock = !heardText
    ? isOpening
      ? "Это начало звонка. Собеседник только что взял трубку. Сгенерируй короткую приветственную фразу для открытия разговора."
      : "Разговор продолжается. Сгенерируй подходящую следующую реплику, исходя из контекста."
    : `Собеседник только что сказал:\n"${heardText}"\n\nСгенерируй ответ для пользователя.`;

  const regenerateBlock = regenerate
    ? "\nПользователь уже видел один вариант — дай другую формулировку с тем же смыслом."
    : "";

  return `Ты суфлёр — помогаешь русскоязычному человеку вести телефонный разговор по-итальянски.

РОЛИ:
- heard_text — это то что только что сказал СОБЕСЕДНИК (итальянец на другом конце провода).
- Твоя задача — сгенерировать ответ для РУССКОЯЗЫЧНОГО ПОЛЬЗОВАТЕЛЯ, который он произнесёт вслух в ответ на heard_text.
- Ты не отвечаешь собеседнику — ты пишешь слова для пользователя.

КОНТЕКСТ ЗВОНКА:
${callContext || "Информация не указана."}

ИСТОРИЯ РАЗГОВОРА:
${historyText || "(начало разговора)"}

ЗАДАЧА:
${taskBlock}
${regenerateBlock}

ЦЕЛЬ ЗВОНКА И ГРАНИЦЫ:
ВАЖНО: Твоя задача — помочь пользователю достичь конкретной цели звонка: ${callContext || "см. контекст выше"}.

Правила:
1. Не выходи за рамки цели звонка. Если цель — заказать пиццу на 18:00,
   не предлагай альтернативы (завтра, другое время) если пользователь
   сам не просил об этом.

2. Если собеседник говорит что не может выполнить запрос —
   предложи ТОЛЬКО две реакции:
   а) уточняющий вопрос строго в рамках цели ("А когда вы работаете?")
   б) вежливое завершение ("Понятно, спасибо, перезвоню позже")

3. Никогда не предлагай то чего пользователь не просил.
   Пользователь сам решает менять ли цель звонка.

ТРЕБОВАНИЯ К ФРАЗЕ:
- Максимум 1–2 предложения. Не больше.
- Человек будет читать её вслух по телефону прямо сейчас — фраза должна быть короткой и произносимой.
- Формальный итальянский (форма Lei).
- Никаких вводных слов, никаких объяснений — только сама реплика.
- Не используй эмодзи.

ОПРЕДЕЛЕНИЕ ПРОЩАНИЯ:
Если итальянская реплика является прощанием (arrivederci, ciao, buona giornata, grazie mille, a presto и подобные) — FAREWELL: true. Иначе FAREWELL: false.

ТРАНСЛИТЕРАЦИЯ — СТРОГИЕ ПРАВИЛА:
Ударение обозначай знаком ударения (́) над гласной — НЕ заглавной буквой. Все буквы строчные.
Правильно: буонджо́рно, ворре́й, гра́цие, арриведе́рчи.
Неправильно: буонджОрно, воррЭй, грАцие (заглавные буквы запрещены).
Используй: а́ е́ и́ о́ у́ э́ ы́ — гласная со знаком ударения сразу над ней.
- gn → нь, gli → ль, ch → к, gh → г, ci/ce → чи/че, gi/ge → джи/дже
- zz → цц/ддз, двойные согласные → удвоение

ФОРМАТ ОТВЕТА — строго этот порядок, ничего лишнего:
ITALIAN: [итальянская фраза]
RUSSIAN: [перевод на русский]
TRANSLIT: [транслит с одной заглавной ударной гласной]
FAREWELL: [true или false]

Пример:
ITALIAN: Capisco, a che ora potete consegnare?
RUSSIAN: Понятно, во сколько вы можете доставить?
TRANSLIT: капИшко, а ке Ора потЭте консеньАре?
FAREWELL: false`;
}

export async function POST(req: NextRequest) {
  // Rate limit: 60 requests per hour per IP
  const ip = getClientIP(req);
  if (!checkRateLimit(`suggest:${ip}`, 500, 3_600_000)) {
    return fallbackResponse();
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return fallbackResponse();
  }

  let body: SuggestRequest;
  try {
    body = await req.json();
  } catch {
    return fallbackResponse();
  }

  const heardText   = body.heard_text   ? sanitizeInput(body.heard_text, 500)    : null;
  const callContext = sanitizeInput(body.call_context ?? "", 300);
  const history     = sanitizeHistory(body.history, 8, 400) as HistoryEntry[];
  const regenerate  = body.regenerate === true;

  const system = buildSystemPrompt(callContext, history, heardText, regenerate);

  try {
    const stream = getAnthropicClient().messages.stream({
      model: MODEL,
      max_tokens: 200,
      system,
      messages: [{ role: "user", content: "Сгенерируй ответ." }],
    });

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              if (
                chunk.type === "content_block_delta" &&
                chunk.delta.type === "text_delta"
              ) {
                controller.enqueue(new TextEncoder().encode(chunk.delta.text));
              }
            }
          } catch (err) {
            console.error("[suggest] stream error:", err);
          } finally {
            controller.close();
          }
        },
      }),
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  } catch {
    console.error("[suggest] Claude request failed");
    return fallbackResponse();
  }
}

function fallbackResponse() {
  const f = SUGGEST_FALLBACK;
  const text = `ITALIAN: ${f.italian}\nRUSSIAN: ${f.russian}\nTRANSLIT: ${f.translit}\nFAREWELL: false`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
