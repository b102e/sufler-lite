# AI Agent Protocol — Суфлер Lite

Rules for all AI coders working on this project.

## Before Coding

1. Read `START_HERE.md` and all context files in order.
2. Read `handoffs/latest.md` to understand exact current state.
3. Identify the next recommended task.
4. Write a short pre-coding summary:
   - what is the current state
   - what you will implement
   - which files you expect to touch

## During Coding

5. Implement only the scoped task from the handoff.
6. Keep files small and focused.
7. Preserve existing conventions — naming, structure, dark theme, Russian text.
8. Do not refactor unrelated code.
9. Do not add auth, ORMs, or external AI integrations not already present.
10. Do not introduce vector DBs, LangChain, or microservices.

## After Coding

11. Update `context/current_state.md`.
12. Update `handoffs/latest.md`.
13. Create a new timestamped handoff: `handoffs/YYYY-MM-DD_HHMM.md`.
14. Commit with a scoped message.

## Hard Rules

- Mobile-first always.
- Russian text throughout the UI.
- No emojis in the interface.
- No English visible to users.
- Option buttons are primary interaction — typing is secondary.
- Anxiety reduction > feature richness.
- This is NOT a general chatbot. Every AI interaction is constrained and goal-directed.
- The user always reads replies aloud manually. There is NO TTS/voice output.
- Deepgram is for STT only. Never for TTS.
