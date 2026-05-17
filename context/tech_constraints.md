# Tech Constraints — Суфлер Lite

## Why separate from chiamaperme

This is a standalone "lite" fork optimized for manual reading mode only.
No TTS, no voice output, no mode selection. Simpler state machine.
Runs on different ports (3010/3011) to coexist with the parent project.

## Why SQLite

Zero external infrastructure. Fast local setup. Easy inspection during development.
DB file: `data/sufler.db`. Lazy-initialized at first request (not at module load).

## Why separate WebSocket process

Keeps realtime concerns (Deepgram proxy, audio streaming) isolated from Next.js rendering.
Simpler to restart, debug, and scale independently.

## Why lazy DB initialization

Next.js pre-executes API route modules at build time. Eager DB initialization causes
`SQLITE_BUSY` errors during `next build`. Lazy init fixes this.

## Why readKeyFromFile() in API routes

Next.js does not load `.env.local` into `process.env` at module initialization time
in git worktree / dev environments. Direct file reading is a reliable fallback.
This is a dev-environment issue only. In production, system env vars are always available.

## Deepgram SDK v5

The project uses `@deepgram/sdk` v5.2.0. The live connection API is:
```js
const live = await dg.listen.v1.connect({...});
const wrapped = await live.connect();
const ws = wrapped.socket; // ReconnectingWebSocket
ws.addEventListener('open', ...) // fires on connect
ws.addEventListener('message', ...) // Deepgram transcript results
ws.send(buffer) // send audio
ws.close() // disconnect
```

## Token budget (Claude Haiku)

Onboarding chat: max 10 user messages, near-limit at 7.
Context compression: last 6 messages sent to Claude (profile carries all extracted data).
Live suggestions: last 8 transcript entries sent.

## Audio format

Browser records via `MediaRecorder` with `audio/webm;codecs=opus` (250ms chunks).
Chunks are base64-encoded and sent as JSON over WebSocket.
Deepgram auto-detects the container format — no manual encoding spec needed.

## No auth

Sprint 1 priority is interaction loop and usability. Auth comes after PMF.
