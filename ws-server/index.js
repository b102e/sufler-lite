const { WebSocketServer } = require("ws");
const { DeepgramClient } = require("@deepgram/sdk");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.WS_PORT ?? "3011", 10);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidSessionId(id) {
  return typeof id === "string" && UUID_RE.test(id);
}

const MAX_TEXT_LEN = 1024;

// ─── Deepgram ─────────────────────────────────────────────────────────────────

function readDeepgramKey() {
  if (process.env.DEEPGRAM_API_KEY) return process.env.DEEPGRAM_API_KEY;
  for (const name of [".env.local", ".env"]) {
    try {
      const content = fs.readFileSync(path.join(process.cwd(), name), "utf-8");
      const match = content.match(/^DEEPGRAM_API_KEY=(.+)$/m);
      if (match) return match[1].trim();
    } catch { /* skip */ }
  }
  return null;
}

// sessionId → { dgSocket, browserSocket, pendingChunks }
const deepgramSessions = new Map();
// sessionId → close timer (grace period after audio:stop)
const dgCloseTimers = new Map();

const DG_GRACE_MS = 8000; // keep Deepgram alive 8s after audio:stop

async function startDeepgramSession(browserSocket, sessionId, language = "it") {
  // Cancel any pending grace-period close
  if (dgCloseTimers.has(sessionId)) {
    clearTimeout(dgCloseTimers.get(sessionId));
    dgCloseTimers.delete(sessionId);
  }

  if (deepgramSessions.has(sessionId)) {
    // Reuse existing connection — update browser socket reference and signal ready
    deepgramSessions.get(sessionId).browserSocket = browserSocket;
    browserSocket.send(JSON.stringify({ type: "audio:ready", sessionId }));
    console.log(`[dg] reused for ${sessionId}`);
    return;
  }

  const key = readDeepgramKey();
  if (!key) {
    console.error("[dg] DEEPGRAM_API_KEY not set");
    browserSocket.send(JSON.stringify({ type: "audio:error", sessionId, reason: "no_key" }));
    return;
  }

  const session = { dgSocket: null, browserSocket, pendingChunks: [] };
  deepgramSessions.set(sessionId, session);

  try {
    const dg = new DeepgramClient({ apiKey: key });
    const live = await dg.listen.v1.connect({
      language,
      model: "nova-2",
      interim_results: true,
      smart_format: false,
      punctuate: false,
      endpointing: false,
    });
    const wrapped = await live.connect();
    const dgWs = wrapped.socket;
    session.dgSocket = dgWs;

    dgWs.addEventListener("open", () => {
      console.log(`[dg] open for ${sessionId}`);
      for (const chunk of session.pendingChunks) dgWs.send(chunk);
      session.pendingChunks = [];
      browserSocket.send(JSON.stringify({ type: "audio:ready", sessionId }));
    });

    dgWs.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        if (data.type === "Results") {
          const text = data.channel?.alternatives?.[0]?.transcript ?? "";
          if (!text) return;
          const isFinal = data.speech_final || data.is_final;
          if (isFinal) {
            browserSocket.send(JSON.stringify({ type: "transcript:final", sessionId, text }));
          } else {
            browserSocket.send(JSON.stringify({ type: "transcript:partial", sessionId, text }));
          }
        }
      } catch { /* ignore */ }
    });

    dgWs.addEventListener("error", (e) => {
      console.error(`[dg] error for ${sessionId}:`, e?.message ?? e);
    });

    dgWs.addEventListener("close", () => {
      console.log(`[dg] closed for ${sessionId}`);
      deepgramSessions.delete(sessionId);
    });

  } catch (err) {
    console.error(`[dg] connect failed for ${sessionId}:`, err.message);
    deepgramSessions.delete(sessionId);
    browserSocket.send(JSON.stringify({ type: "audio:error", sessionId, reason: err.message }));
  }
}

function sendAudioBinary(sessionId, buffer) {
  const session = deepgramSessions.get(sessionId);
  if (!session) return;
  if (session.dgSocket && session.dgSocket.readyState === 1 /* OPEN */) {
    session.dgSocket.send(buffer);
  } else {
    session.pendingChunks.push(buffer);
  }
}

function stopDeepgramSession(sessionId, immediate = false) {
  const session = deepgramSessions.get(sessionId);
  if (!session) return;

  if (immediate) {
    clearTimeout(dgCloseTimers.get(sessionId));
    dgCloseTimers.delete(sessionId);
    try { session.dgSocket?.close(); } catch { /* ignore */ }
    deepgramSessions.delete(sessionId);
    console.log(`[dg] stopped (immediate) for ${sessionId}`);
    return;
  }

  // Grace period — keep connection alive, close later
  if (!dgCloseTimers.has(sessionId)) {
    const timer = setTimeout(() => {
      const s = deepgramSessions.get(sessionId);
      if (s) {
        try { s.dgSocket?.close(); } catch { /* ignore */ }
        deepgramSessions.delete(sessionId);
      }
      dgCloseTimers.delete(sessionId);
      console.log(`[dg] closed after grace for ${sessionId}`);
    }, DG_GRACE_MS);
    dgCloseTimers.set(sessionId, timer);
    console.log(`[dg] grace period started for ${sessionId}`);
  }
}

// ─── WebSocket Server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });
console.log(`[ws] server listening on ws://localhost:${PORT}`);

const MAX_CONNECTIONS_PER_IP = 3;
const connectionsByIp = new Map();

wss.on("connection", (socket, req) => {
  const addr = req.socket.remoteAddress ?? "unknown";
  const count = connectionsByIp.get(addr) ?? 0;

  if (count >= MAX_CONNECTIONS_PER_IP) {
    console.warn(`[ws] rejected: too many connections from ${addr}`);
    socket.close(1008, "Too many connections");
    return;
  }

  connectionsByIp.set(addr, count + 1);
  socket.on("close", () => {
    const c = connectionsByIp.get(addr) ?? 1;
    if (c <= 1) connectionsByIp.delete(addr);
    else connectionsByIp.set(addr, c - 1);
  });

  console.log(`[ws] connected: ${addr}`);

  socket.on("message", (raw, isBinary) => {
    // Binary frame = raw audio chunk from MediaRecorder
    if (isBinary) {
      if (isValidSessionId(socket.sessionId)) sendAudioBinary(socket.sessionId, raw);
      return;
    }

    // Text frame = JSON control message
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      if (raw.toString() === "ping") socket.send("pong");
      return;
    }

    const { type, sessionId, language } = msg;

    switch (type) {
      case "session:start":
        if (!isValidSessionId(sessionId)) break;
        socket.sessionId = sessionId;
        console.log(`[ws] session:start ${sessionId}`);
        socket.send(JSON.stringify({ type: "session:ready", sessionId }));
        break;

      case "option:chosen":
        socket.send(JSON.stringify({ type: "option:ack", sessionId }));
        break;

      case "session:end":
        if (!isValidSessionId(sessionId)) break;
        stopDeepgramSession(sessionId, true); // immediate on session end
        socket.sessionId = null;
        console.log(`[ws] session:end ${sessionId}`);
        socket.send(JSON.stringify({ type: "session:closed", sessionId }));
        break;

      case "audio:start": {
        if (!isValidSessionId(sessionId)) break;
        const lang = typeof language === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(language)
          ? language : "it";
        console.log(`[ws] audio:start ${sessionId} lang=${lang}`);
        startDeepgramSession(socket, sessionId, lang);
        break;
      }

      case "audio:stop":
        if (!isValidSessionId(sessionId)) break;
        console.log(`[ws] audio:stop ${sessionId}`);
        stopDeepgramSession(sessionId);
        socket.send(JSON.stringify({ type: "audio:stopped", sessionId }));
        break;

      default:
        if (type) console.log(`[ws] unknown type: ${String(type).slice(0, 32)}`);
    }
  });

  socket.on("close", () => console.log(`[ws] disconnected: ${addr}`));
  socket.on("error", (err) => console.error(`[ws] error ${addr}:`, err.message));
});
