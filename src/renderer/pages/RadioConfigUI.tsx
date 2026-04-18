import React, { useState, useCallback, useMemo } from 'react';

interface CategoryDef {
  label: string;
  icon: string;
  description: string;
  situations: string[];
}

const RADIO_CATEGORIES: Record<string, CategoryDef> = {
  tyres: { label: 'Tyre Management', icon: '🔄', description: 'Tyre wear, degradation, and compound advice', situations: ['high_wear', 'critical_wear', 'graining', 'blistering', 'cold_tyres', 'overheating', 'optimal_temp'] },
  incident: { label: 'Incidents & Damage', icon: '⚠️', description: 'Damage reports and incident alerts', situations: ['wing_damage', 'floor_damage', 'puncture', 'engine_damage', 'gearbox_issue', 'ers_fault'] },
  flags: { label: 'Flags & Safety Car', icon: '🏁', description: 'Flag conditions and safety car periods', situations: ['yellow_flag', 'safety_car', 'virtual_sc', 'red_flag', 'blue_flag', 'green_flag'] },
  racecraft: { label: 'Racecraft & Battles', icon: '⚔️', description: 'Attack, defense, and DRS situations', situations: ['drs_available', 'car_behind_close', 'car_ahead_close', 'overtake_opportunity', 'defend_position', 'slipstream'] },
  normal: { label: 'Race Progress', icon: '📊', description: 'Position changes, lap updates, fuel status', situations: ['position_gained', 'position_lost', 'fastest_lap', 'gap_change', 'fuel_warning', 'fuel_critical'] },
  weather: { label: 'Weather', icon: '🌤️', description: 'Weather changes and rain predictions', situations: ['rain_incoming', 'rain_started', 'drying_track', 'temperature_change'] },
  pit: { label: 'Pit Strategy', icon: '🔧', description: 'Pit window, undercut, and strategy calls', situations: ['pit_window_open', 'undercut_threat', 'overcut_opportunity', 'box_now', 'stay_out', 'sc_pit_opportunity'] },
  ers: { label: 'ERS & Energy', icon: '⚡', description: 'Battery management and deployment', situations: ['low_battery', 'full_battery', 'harvest_mode', 'deploy_opportunity'] },
  start: { label: 'Race Start', icon: '🏎️', description: 'Formation lap and start procedures', situations: ['formation_lap', 'lights_out', 'good_start', 'poor_start'] },
  session: { label: 'Session Info', icon: '📋', description: 'Session timing and checkered flag', situations: ['session_start', 'halfway_point', 'final_laps', 'checkered_flag'] },
  pace: { label: 'Pace Management', icon: '⏱️', description: 'Lap time analysis and pace advice', situations: ['personal_best', 'pace_drop', 'consistent_pace', 'sector_improvement'] },
  drs: { label: 'DRS Zones', icon: '📡', description: 'DRS activation and deactivation', situations: ['drs_enabled', 'drs_disabled', 'drs_detection'] },
  penalties: { label: 'Penalties', icon: '⛔', description: 'Track limits and penalty warnings', situations: ['track_limits_warning', 'penalty_received', 'penalty_served'] },
  team: { label: 'Team Orders', icon: '📻', description: 'Team strategy and multi-car coordination', situations: ['hold_position', 'swap_positions', 'push_hard', 'manage_gap'] },
  finish: { label: 'Race Finish', icon: '🏆', description: 'Final lap and results', situations: ['last_lap', 'finish_position', 'race_complete'] },
};

interface CategoryConfig {
  enabled: boolean;
  aiEnabled: boolean;
  situations: Record<string, boolean>;
}
type RadioConfigState = Record<string, CategoryConfig>;

function initConfig(): RadioConfigState {
  const cfg: RadioConfigState = {};
  for (const [key, cat] of Object.entries(RADIO_CATEGORIES)) {
    const sits: Record<string, boolean> = {};
    cat.situations.forEach(s => { sits[s] = true; });
    cfg[key] = { enabled: true, aiEnabled: false, situations: sits };
  }
  return cfg;
}

function formatSitLabel(sit: string): string {
  return sit.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function RadioConfig() {
  const [config, setConfig] = useState<RadioConfigState>(initConfig);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [masterEnabled, setMasterEnabled] = useState(true);

  const aiCount = useMemo(() => {
    let count = 0;
    for (const [key, cat] of Object.entries(config)) {
      if (cat.aiEnabled) count += RADIO_CATEGORIES[key]?.situations.length || 0;
    }
    return count;
  }, [config]);

  const toggleCategory = useCallback((key: string, enabled: boolean) => {
    setConfig(prev => ({ ...prev, [key]: { ...prev[key], enabled } }));
  }, []);

  const toggleAi = useCallback((key: string, aiEnabled: boolean) => {
    setConfig(prev => ({ ...prev, [key]: { ...prev[key], aiEnabled } }));
  }, []);

  const toggleSituation = useCallback((catKey: string, sit: string, enabled: boolean) => {
    setConfig(prev => ({
      ...prev,
      [catKey]: {
        ...prev[catKey],
        situations: { ...prev[catKey].situations, [sit]: enabled },
      },
    }));
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const enableAll = useCallback(() => {
    setConfig(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const sits = { ...next[key].situations };
        for (const s of Object.keys(sits)) sits[s] = true;
        next[key] = { ...next[key], enabled: true, situations: sits };
      }
      return next;
    });
  }, []);

  const disableAll = useCallback(() => {
    setConfig(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) next[key] = { ...next[key], enabled: false };
      return next;
    });
  }, []);

  const aiAll = useCallback(() => {
    setConfig(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) next[key] = { ...next[key], aiEnabled: true };
      return next;
    });
  }, []);

  const aiNone = useCallback(() => {
    setConfig(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) next[key] = { ...next[key], aiEnabled: false };
      return next;
    });
  }, []);

  return (
    <div className="radioconfig-page">
      <div className="radioconfig-header">
        <h2>Radio Configuration</h2>
        <p className="dim">
          Select which situations the race engineer will speak about. Toggle categories on/off,
          or expand to control individual situations. Enable <strong>AI</strong> on categories
          to use GPT Realtime voice (requires GPT mode + credits).
        </p>
        <div className="radioconfig-actions">
          <button className="btn-action" onClick={enableAll}>Enable All</button>
          <button className="btn-action secondary" onClick={disableAll}>Disable All</button>
          <button className="btn-action ai" onClick={aiAll}>AI: All</button>
          <button className="btn-action secondary" onClick={aiNone}>AI: None</button>
          <label className="toggle-label" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={masterEnabled}
              onChange={e => setMasterEnabled(e.target.checked)} />
            Master Radio On/Off
          </label>
        </div>
        <div className="radioconfig-ai-info">
          GPT AI enabled on <strong>{aiCount}</strong> situations.
          More situations = higher credit usage per race.
        </div>
      </div>

      <div className="radioconfig-grid">
        {Object.entries(RADIO_CATEGORIES).map(([key, cat]) => {
          const cfg = config[key];
          const isExpanded = expanded[key] || false;

          return (
            <div key={key} className={`radioconfig-card ${cfg.enabled ? '' : 'disabled'}`}>
              <div className="radioconfig-card-header">
                <label className="radioconfig-cat-toggle">
                  <input type="checkbox" checked={cfg.enabled}
                    onChange={e => toggleCategory(key, e.target.checked)} />
                  <span className="radioconfig-icon">{cat.icon}</span>
                  <span className="radioconfig-cat-title">{cat.label}</span>
                  <span className="radioconfig-cat-count">{cat.situations.length}</span>
                </label>
                <label className="radioconfig-ai-toggle" title="Use AI voice for this category">
                  <input type="checkbox" checked={cfg.aiEnabled}
                    onChange={e => toggleAi(key, e.target.checked)} />
                  <span className="radioconfig-ai-label">AI</span>
                </label>
                <button className={`radioconfig-expand ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => toggleExpand(key)}>
                  {isExpanded ? '▲' : '▼'}
                </button>
              </div>
              <div className="radioconfig-desc">{cat.description}</div>
              {isExpanded && (
                <div className="radioconfig-situations">
                  {cat.situations.map(sit => (
                    <label key={sit} className="radioconfig-sit-item">
                      <input type="checkbox" checked={cfg.situations[sit] !== false}
                        onChange={e => toggleSituation(key, sit, e.target.checked)} />
                      <span>{formatSitLabel(sit)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="radioconfig-footer">
        <strong>How it works:</strong> In <em>Classic</em> mode, all messages use edge-tts voice (free).
        In <em>GPT Realtime</em> mode, categories marked <strong>AI</strong> use GPT-4o voice.
        Categories without AI still use edge-tts.
      </div>
    </div>
  );
}
