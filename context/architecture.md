# Architecture — Суфлер Lite

## Frontend (Next.js 14, App Router)

- `app/page.tsx` — call history dashboard (reads from SQLite via API)
- `app/call/new/page.tsx` — onboarding flow (3 steps: intro → clarification → review)
- `app/call/[id]/page.tsx` — live call screen (state machine: modal → generating → selecting → listening)

## Onboarding Flow

Step 1 — `CallPreparationIntro`: user describes the call in a textarea.
Step 2 — `ClarificationChat`: Claude Haiku asks structured clarifying questions, builds a CallProfile.
Step 3 — `CallSummaryReview`: user reviews and edits collected data, then taps "Начать звонок".

On submit: generates a UUID session ID, writes PrepData to sessionStorage, navigates to `/call/{id}`.

NO mode selection step. Always manual reading mode.

## Live Call Screen State Machine

```
modal → generating → selecting → listening → generating → selecting → ...
```

- `modal`: Pre-call instruction sheet (shown once per session mount)
- `generating`: Skeleton cards while Claude Haiku generates reply options
- `selecting`: 2×2 grid of bilingual cards (Italian + Russian translation)
- `listening`: Deepgram live STT active, mic indicator visible, "Готово" button

## Realtime Server (WebSocket — separate process)

File: `ws-server/index.js`
Port: `3011` (configured via `WS_PORT` env var)

Handles:
- Session lifecycle (`session:start`, `session:end`)
- Option persistence (`option:chosen` → SQLite)
- Deepgram live transcription proxy (`audio:start`, `audio:chunk`, `audio:stop`)
- Broadcasts `transcript:partial`, `transcript:final` back to browser

## AI Layer

- `POST /api/chat` — Claude Haiku, onboarding profile extraction (constrained system prompt, JSON output, budget tracking, context compression)
- `POST /api/suggest` — Claude Haiku, live call response generation (contextual Italian phrases from profile + transcript)

Both routes read API key via `readKeyFromFile()` fallback (Next.js env loading quirk in dev/worktree mode).

## Data Layer (SQLite)

- `lib/db.ts` — lazy singleton, initializes on first request
- DB file: `data/sufler.db`
- Tables: `sessions`, `messages`, `chosen_options`

## Key Types

- `CallProfile` (`lib/call-profile.ts`) — structured data from onboarding
- `SuggestResponse` (`lib/call-suggest.ts`) — AI reply options
- `SessionForTranscript` (`lib/transcript.ts`) — call history entry
- `TranscriptEntry` (`components/live-call/LiveTranscriptPanel.tsx`)

## Ports

| Service | Port |
|---|---|
| Next.js dev | 3010 |
| WS server | 3011 |

## No TTS

There is zero TTS/voice output in this project. Deepgram is used only for STT (speech-to-text).
