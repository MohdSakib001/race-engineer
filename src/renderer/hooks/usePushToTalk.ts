/**
 * usePushToTalk — persist + bind keyboard/gamepad PTT, expose transcript +
 * listening state. Calls `onQuery` with the transcript on release.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPTTManager, type Binding, type PTTManager } from '../lib/ptt-manager';
import { globalInteractionTracker } from '../lib/emergency-gate';
import { api } from '../lib/tauri-api';

interface Opts {
  onQuery: (transcript: string) => void;
}

interface PTTHookValue {
  binding: Binding | null;
  listening: boolean;
  lastTranscript: string;
  lastError: string | null;
  supported: boolean;
  manualListen: () => void;
  manualStop: () => void;
  startLearn: (kind: 'keyboard' | 'gamepad') => void;
  cancelLearn: () => void;
  clearBinding: () => void;
  isLearning: boolean;
}

export function usePushToTalk({ onQuery }: Opts): PTTHookValue {
  const [binding, setBindingState] = useState<Binding | null>(null);
  const [listening, setListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const managerRef = useRef<PTTManager | null>(null);
  const learnCancelRef = useRef<(() => void) | null>(null);
  const supported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Load saved binding on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s: any = await api.loadSettings?.();
        if (mounted && s?.ptt?.binding) setBindingState(s.ptt.binding);
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, []);

  // Create manager once
  useEffect(() => {
    const m = createPTTManager({
      onListenStart: () => setListening(true),
      onListenStop: () => setListening(false),
      onTranscript: (t) => {
        setLastTranscript(t);
        setLastError(null);
        globalInteractionTracker.mark();
        onQuery(t);
      },
      onError: (err) => setLastError(err),
    });
    managerRef.current = m;
    m.start();
    return () => { m.stop(); managerRef.current = null; };
  }, [onQuery]);

  // Re-apply binding when it changes
  useEffect(() => {
    managerRef.current?.setBinding(binding);
  }, [binding]);

  const persistBinding = useCallback(async (b: Binding | null) => {
    try {
      const current: any = (await api.loadSettings?.()) ?? {};
      current.ptt = { ...(current.ptt ?? {}), binding: b };
      await api.saveSettings?.(current);
    } catch { /* ignore */ }
  }, []);

  const startLearn = useCallback((kind: 'keyboard' | 'gamepad') => {
    if (!managerRef.current) return;
    learnCancelRef.current?.();
    setIsLearning(true);
    const stop = managerRef.current.startLearn(kind, (b) => {
      setBindingState(b);
      setIsLearning(false);
      void persistBinding(b);
      learnCancelRef.current = null;
    });
    learnCancelRef.current = () => { stop(); setIsLearning(false); };
  }, [persistBinding]);

  const cancelLearn = useCallback(() => {
    learnCancelRef.current?.();
    learnCancelRef.current = null;
    setIsLearning(false);
  }, []);

  const clearBinding = useCallback(() => {
    setBindingState(null);
    void persistBinding(null);
  }, [persistBinding]);

  const manualListen = useCallback(() => {
    managerRef.current?.startListening();
    globalInteractionTracker.mark();
  }, []);
  const manualStop = useCallback(() => managerRef.current?.stopListening(), []);

  return {
    binding, listening, lastTranscript, lastError, supported,
    manualListen, manualStop, startLearn, cancelLearn, clearBinding, isLearning,
  };
}
