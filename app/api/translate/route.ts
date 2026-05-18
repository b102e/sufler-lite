import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/anthropic";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
import { sanitizeInput } from "@/lib/sanitize";

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!checkRateLimit(`translate:${ip}`, 1000, 3_600_000)) {
    return NextResponse.json({ translation: "" });
  }

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ translation: "" });
  }

  const text = sanitizeInput(body.text, 500);
  if (!text) return NextResponse.json({ translation: "" });

  try {
    const res = await getAnthropicClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      system: "Переведи на русский язык. Верни только перевод, без пояснений и кавычек.",
      messages: [{ role: "user", content: text }],
    });
    const block = res.content[0];
    const translation = block.type === "text" ? block.text.trim() : "";
    return NextResponse.json({ translation });
  } catch {
    console.error("[translate] request failed");
    return NextResponse.json({ translation: "" });
  }
}
