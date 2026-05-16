import React, { useCallback, useMemo, useState } from 'react';
import { usePrefs } from '../context/PrefsContext';
import {
  RADIO_CATEGORIES,
  defaultRadioConfig,
  formatSituationLabel,
  type RadioConfig,
} from '../lib/radio-canonical';

export function RadioConfig() {
  const { radioConfig, radioMasterEnabled, setPrefs } = usePrefs();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const aiCount = useMemo(() => {
    let n = 0;
    for (const cat of RADIO_CATEGORIES) {
      if (radioConfig[cat.key]?.aiEnabled) n += cat.situations.length;
    }
    return n;
  }, [radioConfig]);

  const enabledCount = useMemo(() => {
    let n = 0;
    for (const cat of RADIO_CATEGORIES) {
      const c = radioConfig[cat.key];
      if (!c?.enabled) continue;
      for (const s of cat.situations) {
        if (c.situations[s.key] !== false) n++;
      }
    }
    return n;
  }, [radioConfig]);

  const update = useCallback((producer: (cfg: RadioConfig) => RadioConfig) => {
    setPrefs({ radioConfig: producer(radioConfig) });
  }, [radioConfig, setPrefs]);

  const toggleCategory = useCallback((key: string, enabled: boolean) => {
    update((prev) => ({ ...prev, [key]: { ...prev[key], enabled } }));
  }, [update]);

  const toggleAi = useCallback((key: string, aiEnabled: boolean) => {
    update((prev) => ({ ...prev, [key]: { ...prev[key], aiEnabled } }));
  }, [update]);

  const toggleSituation = useCallback((catKey: string, sit: string, enabled: boolean) => {
    update((prev) => ({
      ...prev,
      [catKey]: {
        ...prev[catKey],
        situations: { ...prev[catKey].situations, [sit]: enabled },
      },
    }));
  }, [update]);

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const enableAll = useCallback(() => {
    update(() => {
      const next = defaultRadioConfig();
      // preserve per-category AI flags
      for (const cat of RADIO_CATEGORIES) {
        next[cat.key].aiEnabled = radioConfig[cat.key]?.aiEnabled === true;
      }
      return next;
    });
  }, [update, radioConfig]);

  const disableAll = useCallback(() => {
    update((prev) => {
      const next: RadioConfig = { ...prev };
      for (const cat of RADIO_CATEGORIES) {
        next[cat.key] = { ...prev[cat.key], enabled: false };
      }
      return next;
    });
  }, [update]);

  const aiAll = useCallback(() => {
    update((prev) => {
      const next: RadioConfig = { ...prev };
      for (const cat of RADIO_CATEGORIES) {
        next[cat.key] = { ...prev[cat.key], aiEnabled: true };
      }
      return next;
    });
  }, [update]);

  const aiNone = useCallback(() => {
    update((prev) => {
      const next: RadioConfig = { ...prev };
      for (const cat of RADIO_CATEGORIES) {
        next[cat.key] = { ...prev[cat.key], aiEnabled: false };
      }
      return next;
    });
  }, [update]);

  return (
    <div className="radioconfig-page">
      <div className="radioconfig-header">
        <h2>Radio Configuration</h2>
        <p className="dim">
          Select which situations the race engineer will speak about. Toggle categories on/off,
          or expand to control individual situations. Enable <strong>AI</strong> on categories
          to use the Claude race-engineer voice (requires Premium API key in Settings).
        </p>
        <div className="radioconfig-actions">
          <button className="btn-action" onClick={enableAll}>Enable All</button>
          <button className="btn-action secondary" onClick={disableAll}>Disable All</button>
          <button className="btn-action ai" onClick={aiAll}>AI: All</button>
          <button className="btn-action secondary" onClick={aiNone}>AI: None</button>
          <label className="toggle-label" style={{ marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={radioMasterEnabled}
              onChange={(e) => setPrefs({ radioMasterEnabled: e.target.checked })}
            />
            Master Radio On/Off
          </label>
        </div>
        <div className="radioconfig-ai-info">
          <strong>{enabledCount}</strong> situations enabled · AI on <strong>{aiCount}</strong> situations.
          More AI = higher API usage per race.
        </div>
      </div>

      <div className="radioconfig-grid">
        {RADIO_CATEGORIES.map((cat) => {
          const cfg = radioConfig[cat.key] ?? { enabled: false, aiEnabled: false, situations: {} };
          const isExpanded = expanded[cat.key] || false;
          return (
            <div key={cat.key} className={`radioconfig-card ${cfg.enabled ? '' : 'disabled'}`}>
              <div className="radioconfig-card-header">
                <label className="radioconfig-cat-toggle">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) => toggleCategory(cat.key, e.target.checked)}
                  />
                  <span className="radioconfig-icon">{cat.icon}</span>
                  <span className="radioconfig-cat-title">{cat.label}</span>
                  <span className="radioconfig-cat-count">{cat.situations.length}</span>
                </label>
                <label className="radioconfig-ai-toggle" title="Use Claude voice for this category">
                  <input
                    type="checkbox"
                    checked={cfg.aiEnabled}
                    onChange={(e) => toggleAi(cat.key, e.target.checked)}
                  />
                  <span className="radioconfig-ai-label">AI</span>
                </label>
                <button
                  className={`radioconfig-expand ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => toggleExpand(cat.key)}
                >
                  {isExpanded ? '▲' : '▼'}
                </button>
              </div>
              <div className="radioconfig-desc">{cat.description}</div>
              {isExpanded && (
                <div className="radioconfig-situations">
                  {cat.situations.map((sit) => (
                    <label key={sit.key} className="radioconfig-sit-item">
                      <input
                        type="checkbox"
                        checked={cfg.situations[sit.key] !== false}
                        onChange={(e) => toggleSituation(cat.key, sit.key, e.target.checked)}
                      />
                      <span>{sit.label || formatSituationLabel(sit.key)}</span>
                      <span className={`radioconfig-sit-urgency u-${sit.urgency}`}>
                        {sit.urgency}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="radioconfig-footer">
        <strong>How it works:</strong> Categories without AI use the free edge-tts engineer voice.
        Categories with <strong>AI</strong> ON ask Claude for a tailored radio line based on
        live telemetry, then speak that — counts against your API usage.
      </div>
    </div>
  );
}
