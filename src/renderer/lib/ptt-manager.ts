/**
 * Push-to-Talk Manager
 *
 * Binds a keyboard key OR a gamepad button (wheel button) to a "listen"
 * action. Hold-to-talk is the default. On press, Web Speech STT starts; on
 * release, the transcript is sent to the caller.
 *
 * Wheel buttons are captured via the HTML5 Gamepad API. Most DD wheels,
 * Logitech G29/G923, Thrustmaster T-series, and Fanatec wheels enumerate
 * as HID gamepads, so their buttons show up as gamepad button indices.
 */

export type BindingKind = 'keyboard' | 'gamepad';

export interface Binding {
  kind: BindingKind;
  /** keyboard: KeyboardEvent.code (e.g. "KeyT", "Space"). gamepad: button index. */
  code: string | number;
  /** "hold" = speak while held, "toggle" = press once to start, press again to stop. */
  mode: 'hold' | 'toggle';
  /** human-readable label for Settings UI */
  label?: string;
}

export interface PTTCallbacks {
  onListenStart?: () => void;
  onListenStop?: () => void;
  onTranscript?: (transcript: string) => void;
  onError?: (err: string) => void;
  onBindingLearned?: (b: Binding) => void;
}

export interface PTTManager {
  setBinding(b: Binding | null): void;
  getBinding(): Binding | null;
  startLearn(kind: BindingKind, onLearn: (b: Binding) => void): () => void;
  start(): void;
  stop(): void;
  startListening(): void;
  stopListening(): void;
  isListening(): boolean;
}

// ── Web Speech API wrapper ───────────────────────────────────────────────────

function createRecognizer(): any | null {
  const W = window as any;
  const Rec = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!Rec) return null;
  const r = new Rec();
  r.continuous = false;
  r.interimResults = false;
  r.lang = 'en-GB';
  r.maxAlternatives = 1;
  return r;
}

// ── Gamepad polling ──────────────────────────────────────────────────────────

function pollGamepads(handler: (gpIdx: number, btnIdx: number, pressed: boolean) => void): () => void {
  const buttonState = new Map<string, boolean>();
  let stopped = false;

  function tick() {
    if (stopped) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) continue;
      for (let b = 0; b < pad.buttons.length; b++) {
        const pressed = pad.buttons[b].pressed;
        const key = `${i}:${b}`;
        const prev = buttonState.get(key) ?? false;
        if (pressed !== prev) {
          buttonState.set(key, pressed);
          handler(i, b, pressed);
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return () => { stopped = true; };
}

// ── Manager ───────────────────────────────────────────────────────────────────

export function createPTTManager(cb: PTTCallbacks): PTTManager {
  let binding: Binding | null = null;
  let recognizer: any | null = null;
  let listening = false;
  let toggleArmed = false;
  let cleanupKeys: (() => void) | null = null;
  let cleanupGamepad: (() => void) | null = null;
  let cleanupLearn: (() => void) | null = null;

  function ensureRecognizer(): any | null {
    if (recognizer) return recognizer;
    recognizer = createRecognizer();
    if (!recognizer) return null;
    recognizer.onstart = () => { listening = true; cb.onListenStart?.(); };
    recognizer.onend = () => { listening = false; cb.onListenStop?.(); };
    recognizer.onerror = (e: any) => {
      listening = false;
      cb.onError?.(e?.error || 'speech-error');
      cb.onListenStop?.();
    };
    recognizer.onresult = (e: any) => {
      const text = Array.from(e.results)
        .map((r: any) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) cb.onTranscript?.(text);
    };
    return recognizer;
  }

  function startListening() {
    if (listening) return;
    const r = ensureRecognizer();
    if (!r) { cb.onError?.('Speech recognition not supported in this environment.'); return; }
    try { r.start(); }
    catch {
      // stale state — recreate
      recognizer = null;
      try { ensureRecognizer()?.start(); }
      catch (e: any) { cb.onError?.(e?.message ?? 'start-failed'); }
    }
  }

  function stopListening() {
    if (!listening) return;
    try { recognizer?.stop(); } catch { /* noop */ }
  }

  function matches(kind: BindingKind, code: string | number): boolean {
    return !!binding && binding.kind === kind && String(binding.code) === String(code);
  }

  function onPress(kind: BindingKind, code: string | number) {
    if (!matches(kind, code)) return;
    if (binding!.mode === 'hold') startListening();
    else {
      toggleArmed = !toggleArmed;
      if (toggleArmed) startListening(); else stopListening();
    }
  }

  function onRelease(kind: BindingKind, code: string | number) {
    if (!matches(kind, code)) return;
    if (binding!.mode === 'hold') stopListening();
  }

  function wire() {
    // Keyboard listeners
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      onPress('keyboard', e.code);
    };
    const up = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      onRelease('keyboard', e.code);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    cleanupKeys = () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };

    // Gamepad polling
    cleanupGamepad = pollGamepads((_gp, btn, pressed) => {
      if (pressed) onPress('gamepad', btn);
      else onRelease('gamepad', btn);
    });
  }

  function unwire() {
    cleanupKeys?.(); cleanupKeys = null;
    cleanupGamepad?.(); cleanupGamepad = null;
  }

  return {
    setBinding(b: Binding | null) {
      binding = b;
      toggleArmed = false;
      if (listening) stopListening();
    },
    getBinding() { return binding; },
    startLearn(kind: BindingKind, onLearn: (b: Binding) => void) {
      // Temporarily listen for ANY keyboard/gamepad input, then resolve.
      cleanupLearn?.();
      if (kind === 'keyboard') {
        const handler = (e: KeyboardEvent) => {
          e.preventDefault();
          const b: Binding = {
            kind: 'keyboard', code: e.code, mode: 'hold',
            label: e.code.replace(/^Key/, '') + ' (keyboard)',
          };
          cleanupLearn?.();
          onLearn(b);
          cb.onBindingLearned?.(b);
        };
        window.addEventListener('keydown', handler, { once: true, capture: true });
        cleanupLearn = () => window.removeEventListener('keydown', handler, { capture: true } as any);
      } else {
        const stop = pollGamepads((_gp, btn, pressed) => {
          if (!pressed) return;
          const b: Binding = {
            kind: 'gamepad', code: btn, mode: 'hold',
            label: `Gamepad button ${btn}`,
          };
          cleanupLearn?.();
          onLearn(b);
          cb.onBindingLearned?.(b);
        });
        cleanupLearn = stop;
      }
      return () => { cleanupLearn?.(); cleanupLearn = null; };
    },
    start() { wire(); },
    stop() { unwire(); stopListening(); },
    startListening, stopListening,
    isListening: () => listening,
  };
}
