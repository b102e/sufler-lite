# Latest Handoff — Суфлер Lite

## Completed

- Created standalone `sufler-lite` project at `/Users/vv/Downloads/MVP/Chiama/sufler-lite`.
- Removed mode selection step (`CallModeSelection` component does not exist here).
- Removed `answers: string[]` from `PrepData` — cleaned up legacy field.
- Onboarding flow: `intro → clarification → review → [Начать звонок] → /call/{uuid}`.
- `CallSummaryReview` button renamed "Начать звонок" (was "Далее").
- After review, generates UUID session, writes PrepData to sessionStorage, navigates directly to live call.
- Lazy DB initialization (`lib/db.ts`) — fixes `SQLITE_BUSY` during `next build`.
- Ports isolated: Next.js on **3010**, WS server on **3011**.
- `NEXT_PUBLIC_WS_URL=ws://localhost:3011` set in `.env.local`.
- AI coder infrastructure added: START_HERE.md, AI_AGENT_PROTOCOL.md, context/, handoffs/.
- Build passes clean (`next build` ✓, `tsc --noEmit` ✓).

## Files Created

- `START_HERE.md`
- `AI_AGENT_PROTOCOL.md`
- `context/vision.md`
- `context/product_principles.md`
- `context/current_state.md`
- `context/architecture.md`
- `context/ux_rules.md`
- `context/tech_constraints.md`
- `handoffs/latest.md`
- `handoffs/2026-05-14_2000.md`
- `package.json`
- All component and lib files (copied and adapted from chiamaperme)

## Files Modified (vs chiamaperme source)

- `components/call-prep/types.ts` — removed `answers`, removed `mode_selection` from FlowStep
- `components/call-prep/CallSummaryReview.tsx` — button "Начать звонок"
- `app/call/new/page.tsx` — full rewrite: no mode_selection, direct navigation to call
- `app/api/sessions/route.ts` — lazy db via `getDb()`
- `app/api/sessions/[id]/route.ts` — lazy db via `getDb()`
- `lib/db.ts` — lazy singleton, DB path `data/sufler.db`
- `ws-server/index.js` — port from `WS_PORT` env var (default 3011)
- `app/layout.tsx` — title "Суфлер"
- `.env.local` — added `NEXT_PUBLIC_WS_URL=ws://localhost:3011`

## Current Status

All core flows working:
- Onboarding (3 steps) → live call screen
- Live call: AI suggestions + Deepgram STT + transcript
- Call history: real SQLite data, delete, transcript download
- Build: ✓ clean

## Known Problems

1. **Call history titles show "Звонок"** — `sessions.task_context` is never populated. PrepData lives only in sessionStorage, not in the DB.
2. **No utterance-end auto-trigger** — WS server sends `transcript:utterance_end` but frontend ignores it. User must tap "Готово" manually.
3. **No WS reconnect** — if WS server drops mid-call, client stays disconnected silently.
4. **readKeyFromFile() dev hack** — needed because Next.js dev server doesn't load .env.local into process.env in some environments. OK for now.

## Architecture Decisions

- No `CallModeSelection` — this project is always manual reading mode.
- Lazy DB singleton to fix build-time `SQLITE_BUSY`.
- Port isolation (3010/3011) so both projects can run simultaneously.
- Copied `readKeyFromFile()` from parent project — same env loading issue.

## Next Recommended Task

**Persist call context to DB so history shows meaningful titles.**

Implementation:
1. Add `POST /api/sessions` route that accepts `{ id, taskContext }` and runs `INSERT OR IGNORE INTO sessions ...` + `UPDATE sessions SET task_context = ? WHERE id = ?`.
2. In `app/call/[id]/page.tsx`, after reading from sessionStorage, POST to `/api/sessions` with `{ id: sessionId, taskContext: prepSession.organization + " — " + prepSession.goal }`.
3. Call history cards will then show the organization name instead of "Звонок".

## Things NOT To Change

- No TTS. No voice output. Ever.
- No mode selection. This project is always manual reading mode.
- Port 3010 (Next.js) and 3011 (WS) — needed for coexistence with parent project.
- Lazy DB init in `lib/db.ts` — do not revert to eager init.
- `readKeyFromFile()` in API routes — do not remove until prod deployment.
- All UI text must be in Russian. Response content is in Italian.

## Technical Debt

- `readKeyFromFile()` is a dev hack — remove once deployed to production with real env vars.
- PrepData in sessionStorage is not durable across page refreshes — fine for MVP.
- No error boundary on the live call screen — a crash shows a white screen.

## Commands To Run

```bash
cd /Users/vv/Downloads/MVP/Chiama/sufler-lite
npm run dev:all       # Next.js on :3010, WS on :3011

# Type check
npx tsc --noEmit

# Production build
npm run build
```
