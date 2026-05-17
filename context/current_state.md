# Current State — Суфлер Lite

## Project Status

Standalone lite fork of chiamaperme. Manual reading mode only. No TTS.

## What Works

### Onboarding (3 steps)
- `CallPreparationIntro` — textarea, user describes the call
- `ClarificationChat` — Claude Haiku collects structured CallProfile via constrained chat (max 10 messages, budget tracking, context compression, jailbreak protection)
- `CallSummaryReview` — editable review form, "Начать звонок" button navigates directly to live call

### Live Call Screen
- Pre-call instruction modal (bottom sheet, once per session)
- State machine: `modal → generating → selecting → listening → generating → ...`
- `generating`: skeleton animation (2×2 pulse cards)
- `selecting`: Claude Haiku-generated bilingual response cards (Italian + Russian)
- `listening`: Deepgram live STT active via WS proxy, partial transcript shown in real time, "Готово" button
- Bottom controls (Без звука / Повторить / Закончить) appear after first response selected
- Session data written to SQLite (`chosen_options`)

### Call History
- Dashboard reads real sessions from SQLite (only sessions with ≥1 chosen option)
- "Скачать транскрипт" → downloads `.txt` file
- "Удалить" → confirmation modal → deletes from DB, UI updates immediately
- Empty state when no calls exist

### Infrastructure
- Next.js 14, TypeScript, Tailwind — all on port 3010
- Standalone WS server on port 3011
- SQLite at `data/sufler.db` (lazy init)
- `.env.local` with ANTHROPIC_API_KEY + DEEPGRAM_API_KEY + NEXT_PUBLIC_WS_URL

## Known Issues

- `prepData` from onboarding is written to `sessionStorage` but NOT persisted to `sessions.task_context` in SQLite — call history cards show "Звонок" title instead of organization name.
- No auto-stop on listening (user must tap "Готово" manually). `utterance_end_ms: 1200` is set on Deepgram but frontend doesn't handle `transcript:utterance_end` event yet.
- No WS reconnect logic — if WS server restarts mid-session, client stays disconnected.
- `readKeyFromFile()` is a dev-environment hack — works in production if system env vars are set.

## Next Step

Persist `prepData` to SQLite `sessions.task_context` so call history shows meaningful titles.

In `app/call/[id]/page.tsx`, after mounting and reading from sessionStorage, POST to `/api/sessions` (new endpoint) to write the profile. Or update the WS `session:start` message to include `taskContext`.
