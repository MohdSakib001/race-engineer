import React, { useState } from 'react';
import { TelemetryProvider } from './context/TelemetryContext';
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
import { Sidebar } from './components/Sidebar';

export type Page =
  | 'dashboard'
  | 'timing'
  | 'lap-history'
  | 'analysis'
  | 'trackmap'
  | 'vehicle'
  | 'session'
  | 'engineer'
  | 'radio'
  | 'settings';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  return (
    <TelemetryProvider>
      <div className="app-shell">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <main className="main-content">
          <PageRenderer page={currentPage} />
        </main>
      </div>
    </TelemetryProvider>
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
    case 'engineer':    return <Engineer />;
    case 'radio':       return <RadioConfig />;
    case 'settings':    return <Settings />;
    default:            return <Dashboard />;
  }
}
