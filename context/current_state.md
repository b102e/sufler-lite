# Current State — Суфлёр Lite

## Project Status

Production deployment at olivehush.com (DigitalOcean Frankfurt, $6/mo droplet).
Next.js 14 on port 3010, WS server on port 3011, served via nginx + SSL (Let's Encrypt).

## What Works

### Hero / Landing Screen
- Logo (sufler-logo-transparent.png, unoptimized to preserve transparency)
- Inline SVG badge "Итальянская версия" in header, logo right
- HowItWorksCarousel (4 images from public/how-it-works/, 600ms crossfade)
- CTA button "Новый звонок →" → /call/new
- Color scheme: Calm Italian Night (cb-* Tailwind tokens)

### Onboarding Flow — ClarificationChat (app/call/new/page.tsx)
- Single-page chat flow, NO separate review screen
- Logo in header instead of text
- Auto-expanding textarea (max-h-32, resets on send)
- First AI message prepended with "Привет! Давайте подготовимся к звонку..."
- Sequential bubble types in uiMessages[]:
  - user / assistant (normal chat)
  - reading-question (choice: translit | italian, re-selectable)
  - ready-message (shows "Отлично. Готово..." + "Проверить данные" button)
  - instruction (AI bubble with numbered steps 1-4 + 2 tips, appears 700ms after ready-message)
- "Проверить данные" opens inline editor in the ready-message bubble
  - Shows "✓ Данные проверены" for 2 sec then reverts to button
  - Edits saved to editedProfile state + sessionStorage("sufler:readMode")
- "Далее" → onComplete(editedProfile ?? profile)
- new/page.tsx: onComplete synchronously writes session to sessionStorage, calls checkMicAndProceed, SKIPS review screen

### Active Call Screen (app/call/[id]/page.tsx)
- No modal — opening suggestion fetched automatically on mount via useEffect
- readMode loaded from sessionStorage("sufler:readMode") set during onboarding
- Chat bubbles: SystemMsg | CounterpartMsg | UserMsg
- UserMsg bubble: 2x2 grid buttons (Я это сказал / Другой вариант / Не расслышал / Завершить)
- Buttons visible only in user_turn phase
- Listening phase: "Собеседник закончил фразу" button (disabled until first partial/final)
- Silence detection: 10s timer resets on any speech, fires → removes bubble + system msg + restores user_turn
- Auto-stop mic: 30s hard limit → handleHeStopped()
- Exit options: blur backdrop + 4 phrases (Спасибо до свидания first, is_farewell=true)
- Auto-inactivity exit: 60s in user_turn → doEndCall()
- Streaming suggest API: text format ITALIAN:/RUSSIAN:/TRANSLIT:/FAREWELL:
- callContext re-read from prepSessionRef on each callSuggestAPI call
- Expired/wrong-device session → shows locked screen with "На главную"
- Deepgram: no grace period, fresh connection per listening cycle, session.browserSocket not stale closure

### WS Server (ws-server/index.js port 3011)
- Binary audio frames (isBinary flag), no base64
- 100ms MediaRecorder chunks
- endpointing: false (no VAD, user controls via button)
- No SQLite — removed entirely
- Per-IP connection limit: 3
- sessionId validated via UUID regex

### API Routes
- /api/chat: Claude Haiku, onboarding intake, rate limit 200/hr
- /api/suggest: streaming text format, rate limit 500/hr
- /api/translate: Claude Haiku, counterpart translation, rate limit 1000/hr
- All: sanitize inputs, no prompt injection

### Post-Call Screen
- Shows transcript (chosenOptions with speaker labels)
- "Скачать транскрипт" → TXT download
- "Выйти" → clears result, returns to hero

## Known Issues

- Deepgram sometimes sends duplicate finals if partial fires very quickly — mitigated by stopped flag but may still occur
- readMode stored in sessionStorage — cleared on tab close (by design for privacy)
- WS server runs as root (production) — acceptable for MVP
- npm audit: 1 moderate vuln in postcss (transitive, unfixable without breaking Next.js upgrade)

## Infrastructure

- Server: DigitalOcean Droplet (Ubuntu 24.04, $6/mo)
- Domain: olivehush.com with SSL
- pm2: sufler-next (port 3010) + sufler-ws (port 3011)
- nginx: proxies both, HSTS, security headers
- UFW: only ports 22, 80, 443 open
- fail2ban: SSH brute force protection
- GitHub: private repo b102e/sufler-lite (SSH via github-b102e alias)

## Commands

```bash
# Local dev
npm run dev:all  # Next.js :3010 + WS :3011

# Production deploy
ssh root@165.245.210.138
cd /var/www/sufler && git pull && npm run build && pm2 restart sufler-next
# WS server (only if ws-server/index.js changed):
pm2 restart sufler-ws

# Type check
npx tsc --noEmit
```
