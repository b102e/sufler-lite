// Patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore\s+(?:previous|all|the\s+above)\s+instructions?/gi,
  /forget\s+(?:your|all|previous|the\s+above)/gi,
  /(?:you\s+are\s+now|act\s+as|pretend\s+(?:to\s+be|you\s+are)|roleplay\s+as)/gi,
  /(?:reveal|show|print|output|display|repeat|leak)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?|context)/gi,
  /(?:new\s+instructions?|override|disregard|bypass)\s+/gi,
  /---+\s*(?:system|human|assistant)\s*---+/gi,
];

export function sanitizeInput(text: unknown, maxLength = 1000): string {
  if (typeof text !== "string") return "";
  let s = text.slice(0, maxLength);
  for (const pattern of INJECTION_PATTERNS) {
    s = s.replace(pattern, "[...]");
  }
  return s.trim();
}

export function sanitizeHistory(
  history: unknown,
  maxItems = 8,
  maxTextLen = 500,
): { role: "user" | "counterpart"; text: string }[] {
  if (!Array.isArray(history)) return [];
  return history
    .slice(0, maxItems)
    .filter(
      (e): e is { role: string; text: string } =>
        e !== null &&
        typeof e === "object" &&
        (e.role === "user" || e.role === "counterpart") &&
        typeof e.text === "string",
    )
    .map(e => ({ role: e.role as "user" | "counterpart", text: sanitizeInput(e.text, maxTextLen) }));
}
