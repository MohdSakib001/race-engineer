/**
 * TTS Speaker — wraps Edge TTS (via Tauri) with a local IndexedDB phrase cache
 * and a single-track audio queue so engineer phrases never overlap.
 */
import { api } from './tauri-api';
import { getCached, putCached } from './phrase-cache';

interface QueueItem {
  text: string;
  voice: string;
  priority: number;
}

const speakerState = {
  queue: [] as QueueItem[],
  current: null as HTMLAudioElement | null,
  urlsToRevoke: [] as string[],
  speaking: false,
};

function base64ToBlobUrl(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/mp3' });
  const url = URL.createObjectURL(blob);
  speakerState.urlsToRevoke.push(url);
  return url;
}

async function fetchAudio(text: string, voice: string): Promise<string | null> {
  const cached = await getCached(voice, text);
  if (cached) return cached;
  try {
    const b64 = await api.ttsSpeak({ text, voice });
    if (!b64) return null;
    void putCached(voice, text, b64);
    return b64;
  } catch {
    return null;
  }
}

async function playNext(): Promise<void> {
  if (speakerState.speaking) return;
  const next = speakerState.queue.shift();
  if (!next) return;
  speakerState.speaking = true;
  const b64 = await fetchAudio(next.text, next.voice);
  if (!b64) {
    speakerState.speaking = false;
    void playNext();
    return;
  }
  const url = base64ToBlobUrl(b64);
  const audio = new Audio(url);
  speakerState.current = audio;
  audio.onended = () => {
    speakerState.current = null;
    speakerState.speaking = false;
    URL.revokeObjectURL(url);
    void playNext();
  };
  audio.onerror = () => {
    speakerState.current = null;
    speakerState.speaking = false;
    URL.revokeObjectURL(url);
    void playNext();
  };
  try { await audio.play(); }
  catch {
    speakerState.current = null;
    speakerState.speaking = false;
    void playNext();
  }
}

export interface SpeakOptions {
  voice?: string;
  /** 0-10 — higher jumps ahead of lower-priority pending items. Default 3. */
  priority?: number;
  /** drop if something higher/equal is already queued */
  dedupeBy?: string;
  /** cancel current & flush queue before speaking */
  interrupt?: boolean;
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  const clean = (text ?? '').trim();
  if (!clean) return;
  const voice = opts.voice ?? 'en-GB-RyanNeural';
  const priority = opts.priority ?? 3;

  if (opts.interrupt) {
    stop();
  }

  // Insert by priority (stable)
  const item: QueueItem = { text: clean, voice, priority };
  let idx = speakerState.queue.findIndex((q) => q.priority < priority);
  if (idx < 0) speakerState.queue.push(item);
  else speakerState.queue.splice(idx, 0, item);

  void playNext();
}

export function stop(): void {
  const cur = speakerState.current;
  speakerState.queue = [];
  speakerState.current = null;
  speakerState.speaking = false;
  if (cur) {
    try { cur.pause(); cur.src = ''; } catch { /* noop */ }
  }
  for (const url of speakerState.urlsToRevoke.splice(0)) {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  }
}

export function isSpeaking(): boolean {
  return speakerState.speaking;
}

/** Pre-warm cache by fetching a phrase without playing it. */
export async function prewarm(text: string, voice = 'en-GB-RyanNeural'): Promise<void> {
  await fetchAudio(text, voice);
}
