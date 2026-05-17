import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

function readKeyFromFile(): string | undefined {
  for (const name of [".env.local", ".env"]) {
    try {
      const content = fs.readFileSync(path.join(process.cwd(), name), "utf-8");
      const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (match) return match[1].trim();
    } catch { /* ignore */ }
  }
}

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY || readKeyFromFile();
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}
