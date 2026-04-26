import React, { useState } from 'react';
import { TelemetryProvider } from './context/TelemetryContext';
import { PrefsProvider } from './context/PrefsContext';
import { Dashboard } from './pages/DashboardUI';
import { TimingTower } from './pages/TimingTowerUI';
import { TrackMap } from './pages/TrackMapUI';
import { VehicleStatus } from './pages/VehicleStatusUI';
import { Session } from './pages/SessionUI';
import { Engineer } from './pages/EngineerUI';
import { RadioConfig } from './pages/RadioConfigUI';
import { Settings } from './pages/SettingsUI';
import { LapHistory } from './pages/LapHistoryUI';
import { Analysis } from './pages/AnalysisUI';
import { Rival } from './pages/RivalUI';
import { Overlay } from './pages/OverlayUI';
import { Sidebar } from './components/Sidebar';
import { useRivalHotkeys } from './hooks/useRivalHotkeys';

export type Page =
  | 'dashboard'
  | 'timing'
  | 'lap-history'
  | 'analysis'
  | 'trackmap'
  | 'vehicle'
  | 'session'
  | 'rival'
  | 'engineer'
  | 'radio'
  | 'settings';

function isOverlayMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('overlay') === '1';
  } catch { return false; }
}

const VALID_PAGES: Page[] = [
  'dashboard', 'timing', 'lap-history', 'analysis', 'trackmap',
  'vehicle', 'session', 'rival', 'engineer', 'radio', 'settings',
];

function readPageFromUrl(): Page | null {
  try {
    const v = new URLSearchParams(window.location.search).get('page');
    if (v && (VALID_PAGES as string[]).includes(v)) return v as Page;
  } catch { /* ignore */ }
  return null;
}

export function App() {
  const overlay = isOverlayMode();
  const lockedPage = readPageFromUrl();

  return (
    <PrefsProvider>
      <TelemetryProvider>
        {overlay
          ? <Overlay />
          : lockedPage
            ? <SinglePageWindow page={lockedPage} />
            : <AppInner />}
      </TelemetryProvider>
    </PrefsProvider>
  );
}

function SinglePageWindow({ page }: { page: Page }) {
  useRivalHotkeys();
  return (
    <div className="app-shell single-page">
      <main className="main-content single-page-main">
        <PageRenderer page={page} />
      </main>
    </div>
  );
}

function AppInner() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  useRivalHotkeys();

  return (
    <div className="app-shell">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="main-content">
        <PageRenderer page={currentPage} />
      </main>
    </div>
  );
}

function PageRenderer({ page }: { page: Page }) {
  switch (page) {
    case 'dashboard':   return <Dashboard />;
    case 'timing':      return <TimingTower />;
    case 'lap-history': return <LapHistory />;
    case 'analysis':    return <Analysis />;
    case 'trackmap':    return <TrackMap />;
    case 'vehicle':     return <VehicleStatus />;
    case 'session':     return <Session />;
    case 'rival':       return <Rival />;
    case 'engineer':    return <Engineer />;
    case 'radio':       return <RadioConfig />;
    case 'settings':    return <Settings />;
    default:            return <Dashboard />;
  }
}
