import { useEffect, useRef, useCallback, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";
const MAX_RECONNECT_ATTEMPTS = 5;

type ConnectionStatus = "connecting" | "ready" | "disconnected";
export type TranscriptCallback = (text: string, isFinal: boolean) => void;

export function useCallSession(sessionId: string) {
  const socketRef              = useRef<WebSocket | null>(null);
  const sessionIdRef           = useRef(sessionId);
  const transcriptCallbackRef  = useRef<TranscriptCallback | null>(null);
  const recorderRef            = useRef<MediaRecorder | null>(null);
  const streamRef              = useRef<MediaStream | null>(null);
  const intentionalCloseRef    = useRef(false);   // set on sendSessionEnd / unmount
  const isListeningRef         = useRef(false);   // true between startListening / stopListening
  const reconnectAttemptsRef   = useRef(0);
  const reconnectTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // ── Audio capture ─────────────────────────────────────────────────────────

  function startCapture() {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    navigator.mediaDevices
      .getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      .then((stream) => {
        streamRef.current = stream;

        const MIME_CANDIDATES = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/mp4;codecs=aac",
          "audio/mp4",
        ];
        const mimeType = MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t));

        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream); // let browser choose
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size === 0) return;
          const ws = socketRef.current;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          ws.send(e.data);
        };

        recorder.start(100);
      })
      .catch((err) => {
        console.warn("[useCallSession] getUserMedia failed:", err.message);
      });
  }

  function stopCapture() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    streamRef.current = null;
  }

  // ── WebSocket connect (called on mount + each reconnect) ──────────────────

  useEffect(() => {
    if (!sessionId) return;

    intentionalCloseRef.current = false;
    reconnectAttemptsRef.current = 0;

    function connect() {
      if (intentionalCloseRef.current) return;

      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;
      setStatus("connecting");

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        ws.send(JSON.stringify({ type: "session:start", sessionId }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);

          if (msg.type === "session:ready") {
            setStatus("ready");
            // Re-request audio if we were listening before the disconnect
            if (isListeningRef.current) {
              ws.send(JSON.stringify({
                type: "audio:start",
                sessionId: sessionIdRef.current,
                language: "it",
              }));
            }
            return;
          }

          if (msg.type === "transcript:partial" && transcriptCallbackRef.current) {
            transcriptCallbackRef.current(msg.text, false);
            return;
          }
          if (msg.type === "transcript:final" && transcriptCallbackRef.current) {
            transcriptCallbackRef.current(msg.text, true);
            return;
          }
          if (msg.type === "audio:ready") {
            startCapture();
            return;
          }
        } catch { /* ignore non-JSON */ }
      };

      ws.onclose = () => {
        stopCapture(); // stop recording — will restart after audio:ready on reconnect
        setStatus("disconnected");

        if (
          !intentionalCloseRef.current &&
          reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
        ) {
          const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 8000);
          reconnectAttemptsRef.current++;
          console.log(`[ws] reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onclose fires after onerror and handles reconnect
      };
    }

    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopCapture();
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "session:end", sessionId: sessionIdRef.current }));
      }
      ws?.close();
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Public API ────────────────────────────────────────────────────────────

  const startListening = useCallback((onTranscript: TranscriptCallback) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    transcriptCallbackRef.current = onTranscript;
    isListeningRef.current = true;
    ws.send(JSON.stringify({ type: "audio:start", sessionId: sessionIdRef.current, language: "it" }));
  }, []);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    transcriptCallbackRef.current = null;
    stopCapture();
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "audio:stop", sessionId: sessionIdRef.current }));
    }
  }, []);

  const sendOptionChosen = useCallback((optionText: string, optionIndex: number) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "option:chosen",
        sessionId: sessionIdRef.current,
        optionText,
        optionIndex,
      }));
    }
  }, []);

  const sendSessionEnd = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    isListeningRef.current = false;
    stopCapture();
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "session:end", sessionId: sessionIdRef.current }));
      ws.close();
    }
  }, []);

  return { status, startListening, stopListening, sendOptionChosen, sendSessionEnd };
}
