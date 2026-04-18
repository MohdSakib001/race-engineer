import React from 'react';
import { useTelemetryContext } from '../context/TelemetryContext';
import type { Page } from '../App';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: Page) => void;
}

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard',   label: 'Dashboard',    icon: '\u229E' },
  { id: 'timing',      label: 'Timing',        icon: '\u23F1' },
  { id: 'lap-history', label: 'Lap History',   icon: '\u2630' },
  { id: 'analysis',    label: 'Analysis',      icon: '\u25A3' },
  { id: 'trackmap',    label: 'Track Map',     icon: '\u25CE' },
  { id: 'vehicle',     label: 'Vehicle',       icon: '\u2B21' },
  { id: 'session',     label: 'Session',       icon: '\u2691' },
  { id: 'engineer',    label: 'Engineer',      icon: '\u2699' },
  { id: 'radio',       label: 'Radio Config',  icon: '\u266B' },
  { id: 'settings',    label: 'Settings',      icon: '\u2263' },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { connected, session, startTelemetry, stopTelemetry } = useTelemetryContext();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="app-title">APEX</h1>
        <span className="app-subtitle">ENGINEER</span>
      </div>

      <div className="connection-status">
        <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
        <span>{connected ? 'LIVE' : 'OFFLINE'}</span>
      </div>

      {session && (
        <div className="session-badge">
          <span className="track-name">{session.trackName}</span>
          <span className="session-type">{session.sessionTypeName}</span>
        </div>
      )}

      <nav className="nav-list">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          className={`telemetry-btn ${connected ? 'stop' : 'start'}`}
          onClick={() => connected ? stopTelemetry() : startTelemetry(20777)}
        >
          {connected ? 'Stop Telemetry' : 'Start Telemetry'}
        </button>
      </div>
    </aside>
  );
}
