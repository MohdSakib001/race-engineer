import React, { createContext, useContext, type ReactNode } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useIntelligence, type IntelligenceData } from '../hooks/useIntelligence';
import type { TelemetryState } from '../../shared/types/store';

export interface TelemetryContextValue extends TelemetryState {
  startTelemetry: (port: number) => void;
  stopTelemetry: () => void;
  intelligence: IntelligenceData;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const telemetry = useTelemetry();
  const intelligence = useIntelligence(telemetry);

  return (
    <TelemetryContext.Provider value={{ ...telemetry, intelligence }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetryContext(): TelemetryContextValue {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error('useTelemetryContext must be used within TelemetryProvider');
  return ctx;
}
