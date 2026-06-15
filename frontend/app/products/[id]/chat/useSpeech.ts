"use client";

/**
 * Browser-native voice I/O for the diagnostic chat — no backend, no API cost.
 *
 * Speech-to-text uses the Web Speech API (`SpeechRecognition`, prefixed
 * `webkitSpeechRecognition` in Chrome/Edge). Text-to-speech uses
 * `speechSynthesis`. Both are client-only and require HTTPS (localhost counts).
 * Support is best in Chrome/Edge; the hook reports `sttSupported` /
 * `ttsSupported` so the UI can hide controls where the API is missing.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// ---- minimal Web Speech typings (not in the DOM lib) ------------------------

type SpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  item(i: number): { transcript: string };
  [i: number]: { transcript: string };
};
type SpeechRecognitionEvent = {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    item(i: number): SpeechRecognitionResult;
    [i: number]: SpeechRecognitionResult;
  };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type UseSpeech = {
  sttSupported: boolean;
  ttsSupported: boolean;
  listening: boolean;
  speaking: boolean;
  /** Begin dictation. `onFinal` fires once per finished utterance. */
  startListening: (handlers: {
    onInterim?: (text: string) => void;
    onFinal: (text: string) => void;
  }) => void;
  stopListening: () => void;
  /** Speak text aloud; `onDone` fires when playback finishes or is cancelled. */
  speak: (text: string, onDone?: () => void) => void;
  cancelSpeak: () => void;
};

/** No-op subscribe — browser capabilities don't change over a session. */
const noopSubscribe = () => () => {};

export function useSpeech(lang = "en-US"): UseSpeech {
  // Capability detection via useSyncExternalStore: returns false on the server
  // and the real value on the client, with no hydration mismatch and no
  // setState-in-effect cascade.
  const sttSupported = useSyncExternalStore(
    noopSubscribe,
    () => getRecognitionCtor() != null,
    () => false,
  );
  const ttsSupported = useSyncExternalStore(
    noopSubscribe,
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recRef = useRef<SpeechRecognitionLike | null>(null);

  // Tear down any in-flight recognition / speech on unmount.
  useEffect(() => {
    return () => {
      recRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const startListening = useCallback<UseSpeech["startListening"]>(
    ({ onInterim, onFinal }) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) return;
      // Tear down any in-flight session first.
      recRef.current?.abort();

      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = false; // one utterance per turn — natural for Q&A
      rec.interimResults = true;

      let finalText = "";
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const text = res[0]?.transcript ?? "";
          if (res.isFinal) finalText += text;
          else interim += text;
        }
        if (interim && onInterim) onInterim((finalText + interim).trim());
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => {
        setListening(false);
        recRef.current = null;
        const text = finalText.trim();
        if (text) onFinal(text);
      };

      recRef.current = rec;
      setListening(true);
      rec.start();
    },
    [lang],
  );

  const cancelSpeak = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback<UseSpeech["speak"]>(
    (text, onDone) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        onDone?.();
        return;
      }
      window.speechSynthesis.cancel(); // never overlap utterances
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 1.02;
      const done = () => {
        setSpeaking(false);
        onDone?.();
      };
      u.onend = done;
      u.onerror = done;
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    [lang],
  );

  return {
    sttSupported,
    ttsSupported,
    listening,
    speaking,
    startListening,
    stopListening,
    speak,
    cancelSpeak,
  };
}
