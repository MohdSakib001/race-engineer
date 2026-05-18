import { useCallback, useEffect, useRef, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';

type UpdaterPhase = 'idle' | 'checking' | 'downloading' | 'installing' | 'up-to-date' | 'error';

export interface UpdaterState {
  phase: UpdaterPhase;
  available: { version: string; date?: string } | null;
  progress: { downloaded: number; total: number | null } | null;
  error: string | null;
}

const INITIAL: UpdaterState = {
  phase: 'idle',
  available: null,
  progress: null,
  error: null,
};

async function promptAndInstall(update: Update): Promise<void> {
  const wantsUpdate = await ask(
    `Apex Engineer v${update.version} is available.\n\n${update.body ?? 'Install now and restart the app?'}`,
    { title: 'Update available', kind: 'info', okLabel: 'Install', cancelLabel: 'Later' },
  );
  if (!wantsUpdate) return;

  await update.downloadAndInstall();
  await relaunch();
}

/**
 * Auto-checks for an update once when the main window mounts. Returns a state
 * snapshot + a `checkNow` callback for a manual "Check for updates" button.
 *
 * Only the main window should auto-check — child windows (driver-*, page-*,
 * overlay) would otherwise show duplicate dialogs.
 */
export function useAppUpdater(options?: { autoCheck?: boolean }) {
  const autoCheck = options?.autoCheck ?? true;
  const [state, setState] = useState<UpdaterState>(INITIAL);
  const ranOnceRef = useRef(false);

  const runCheck = useCallback(async (manual: boolean) => {
    setState((s) => ({ ...s, phase: 'checking', error: null }));
    try {
      const update = await check();
      if (!update) {
        setState({ phase: 'up-to-date', available: null, progress: null, error: null });
        if (manual) await message('You are running the latest version.', { title: 'Up to date', kind: 'info' });
        return;
      }
      setState({
        phase: 'idle',
        available: { version: update.version, date: update.date },
        progress: null,
        error: null,
      });

      const wantsUpdate = await ask(
        `Apex Engineer v${update.version} is available.\n\n${update.body ?? 'Install now and restart the app?'}`,
        { title: 'Update available', kind: 'info', okLabel: 'Install', cancelLabel: 'Later' },
      );
      if (!wantsUpdate) return;

      let total: number | null = null;
      let downloaded = 0;
      setState((s) => ({ ...s, phase: 'downloading', progress: { downloaded: 0, total: null } }));

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null;
          setState((s) => ({ ...s, progress: { downloaded: 0, total } }));
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setState((s) => ({ ...s, progress: { downloaded, total } }));
        } else if (event.event === 'Finished') {
          setState((s) => ({ ...s, phase: 'installing' }));
        }
      });

      await relaunch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ phase: 'error', available: null, progress: null, error: msg });
      if (manual) await message(`Update check failed: ${msg}`, { title: 'Update error', kind: 'error' });
    }
  }, []);

  const checkNow = useCallback(() => runCheck(true), [runCheck]);

  useEffect(() => {
    if (!autoCheck || ranOnceRef.current) return;
    ranOnceRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        // Only the main window auto-checks; child windows (driver-*, page-*, overlay) skip.
        const label = getCurrentWindow().label;
        if (label !== 'main') return;
        if (cancelled) return;
        await runCheck(false);
      } catch {
        // window/runtime not available — silently skip.
      }
    })();
    return () => { cancelled = true; };
  }, [autoCheck, runCheck]);

  return { ...state, checkNow };
}

// Re-export for callers that want to invoke the install flow without the hook state.
export { promptAndInstall };
