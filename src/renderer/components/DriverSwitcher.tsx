import React, { useCallback, useEffect, useState } from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import { usePrefs } from '../context/PrefsContext';
import { api, PRIMARY_SLOT } from '../lib/tauri-api';

interface SlotInfo { slot: string; port: number }

export function DriverSwitcher() {
  const { slot: activeSlot, locked, setSlot } = useTelemetryContext();
  const { telemetryPorts } = usePrefs();
  const [running, setRunning] = useState<SlotInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.listTelemetrySlots();
      setRunning(r.slots || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const slotLabelByPort = (port: number, idx: number) =>
    idx === 0 ? PRIMARY_SLOT : `d${idx + 1}`;

  const slots = telemetryPorts.map((port, i) => ({
    slot: slotLabelByPort(port, i),
    port,
    running: running.some((r) => r.slot === slotLabelByPort(port, i)),
  }));

  const startSlot = async (slot: string, port: number) => {
    setBusy(slot);
    try { await api.startTelemetry(port, slot); } finally { setBusy(null); refresh(); }
  };
  const stopSlot = async (slot: string) => {
    setBusy(slot);
    try { await api.stopTelemetry(slot); } finally { setBusy(null); refresh(); }
  };
  const popOut = async (slot: string) => {
    try { await api.openDriverWindow(slot); } catch (e) { console.error(e); }
  };

  if (locked) {
    return (
      <div className="driver-switcher-locked">
        <span className="dim" style={{ fontSize: 11 }}>DRIVER</span>
        <span className="driver-slot-pill">{activeSlot}</span>
      </div>
    );
  }

  return (
    <div className="driver-switcher">
      <div className="driver-switcher-title">DRIVERS</div>
      {slots.map((s) => {
        const active = s.slot === activeSlot;
        return (
          <div key={s.slot} className={`driver-slot-row ${active ? 'active' : ''}`}>
            <button
              className={`driver-slot-pill ${active ? 'active' : ''}`}
              onClick={() => setSlot(s.slot)}
              title={`Watch ${s.slot} (port ${s.port})`}
            >
              {s.slot} <span className="dim" style={{ fontSize: 10 }}>:{s.port}</span>
              {s.running && <span className="dot-live" />}
            </button>
            <button
              className="btn-small"
              disabled={busy === s.slot}
              onClick={() => s.running ? stopSlot(s.slot) : startSlot(s.slot, s.port)}
              title={s.running ? 'Stop listener' : 'Start listener'}
            >
              {s.running ? '■' : '▶'}
            </button>
            <button className="btn-small" onClick={() => popOut(s.slot)} title="Open in new window">⧉</button>
          </div>
        );
      })}
    </div>
  );
}
