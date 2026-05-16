/**
 * Canonical radio category / situation catalogue.
 *
 * Single source of truth shared between RadioConfigUI (the checkbox list)
 * and useAutoRadio (the detection engine). If a situation is not in this
 * file, it must not be voiced — period.
 */

export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export interface SituationDef {
  key: string;
  label: string;
  urgency: Urgency;
}

export interface CategoryDef {
  key: string;
  label: string;
  icon: string;
  description: string;
  situations: SituationDef[];
}

export const RADIO_CATEGORIES: CategoryDef[] = [
  {
    key: 'tyres',
    label: 'Tyre Management',
    icon: '🔄',
    description: 'Tyre wear, degradation, and compound advice',
    situations: [
      { key: 'high_wear',      label: 'High wear',      urgency: 'high' },
      { key: 'critical_wear',  label: 'Critical wear',  urgency: 'critical' },
      { key: 'graining',       label: 'Graining',       urgency: 'medium' },
      { key: 'blistering',     label: 'Blistering',     urgency: 'medium' },
      { key: 'cold_tyres',     label: 'Cold tyres',     urgency: 'medium' },
      { key: 'overheating',    label: 'Overheating',    urgency: 'high' },
      { key: 'optimal_temp',   label: 'Optimal temp',   urgency: 'low' },
    ],
  },
  {
    key: 'incident',
    label: 'Incidents & Damage',
    icon: '⚠️',
    description: 'Damage reports and incident alerts',
    situations: [
      { key: 'wing_damage',    label: 'Wing damage',    urgency: 'high' },
      { key: 'floor_damage',   label: 'Floor damage',   urgency: 'high' },
      { key: 'puncture',       label: 'Puncture',       urgency: 'critical' },
      { key: 'engine_damage',  label: 'Engine damage',  urgency: 'critical' },
      { key: 'gearbox_issue',  label: 'Gearbox issue',  urgency: 'high' },
      { key: 'ers_fault',      label: 'ERS fault',      urgency: 'high' },
    ],
  },
  {
    key: 'flags',
    label: 'Flags & Safety Car',
    icon: '🏁',
    description: 'Flag conditions and safety car periods',
    situations: [
      { key: 'yellow_flag',    label: 'Yellow flag',    urgency: 'high' },
      { key: 'safety_car',     label: 'Safety car',     urgency: 'critical' },
      { key: 'virtual_sc',     label: 'Virtual SC',     urgency: 'high' },
      { key: 'red_flag',       label: 'Red flag',       urgency: 'critical' },
      { key: 'blue_flag',      label: 'Blue flag',      urgency: 'high' },
      { key: 'green_flag',     label: 'Green flag',     urgency: 'medium' },
    ],
  },
  {
    key: 'racecraft',
    label: 'Racecraft & Battles',
    icon: '⚔️',
    description: 'Attack, defense, and DRS situations',
    situations: [
      { key: 'drs_available',          label: 'DRS available',          urgency: 'medium' },
      { key: 'car_behind_close',       label: 'Car behind close',       urgency: 'medium' },
      { key: 'car_ahead_close',        label: 'Car ahead close',        urgency: 'medium' },
      { key: 'overtake_opportunity',   label: 'Overtake opportunity',   urgency: 'high' },
      { key: 'defend_position',        label: 'Defend position',        urgency: 'high' },
      { key: 'slipstream',             label: 'Slipstream',             urgency: 'low' },
    ],
  },
  {
    key: 'normal',
    label: 'Race Progress',
    icon: '📊',
    description: 'Position changes, lap updates, fuel status',
    situations: [
      { key: 'position_gained', label: 'Position gained', urgency: 'medium' },
      { key: 'position_lost',   label: 'Position lost',   urgency: 'high' },
      { key: 'fastest_lap',     label: 'Fastest lap',     urgency: 'medium' },
      { key: 'gap_change',      label: 'Gap change',      urgency: 'low' },
      { key: 'fuel_warning',    label: 'Fuel warning',    urgency: 'medium' },
      { key: 'fuel_critical',   label: 'Fuel critical',   urgency: 'critical' },
    ],
  },
  {
    key: 'weather',
    label: 'Weather',
    icon: '🌤️',
    description: 'Weather changes and rain predictions',
    situations: [
      { key: 'rain_incoming',      label: 'Rain incoming',      urgency: 'high' },
      { key: 'rain_started',       label: 'Rain started',       urgency: 'critical' },
      { key: 'drying_track',       label: 'Drying track',       urgency: 'medium' },
      { key: 'temperature_change', label: 'Temperature change', urgency: 'low' },
    ],
  },
  {
    key: 'pit',
    label: 'Pit Strategy',
    icon: '🔧',
    description: 'Pit window, undercut, and strategy calls',
    situations: [
      { key: 'pit_window_open',     label: 'Pit window open',     urgency: 'medium' },
      { key: 'undercut_threat',     label: 'Undercut threat',     urgency: 'high' },
      { key: 'overcut_opportunity', label: 'Overcut opportunity', urgency: 'medium' },
      { key: 'box_now',             label: 'Box now',             urgency: 'critical' },
      { key: 'stay_out',            label: 'Stay out',            urgency: 'high' },
      { key: 'sc_pit_opportunity',  label: 'SC pit opportunity',  urgency: 'critical' },
    ],
  },
  {
    key: 'ers',
    label: 'ERS & Energy',
    icon: '⚡',
    description: 'Battery management and deployment',
    situations: [
      { key: 'low_battery',         label: 'Low battery',         urgency: 'high' },
      { key: 'full_battery',        label: 'Full battery',        urgency: 'low' },
      { key: 'harvest_mode',        label: 'Harvest mode',        urgency: 'low' },
      { key: 'deploy_opportunity',  label: 'Deploy opportunity',  urgency: 'medium' },
    ],
  },
  {
    key: 'start',
    label: 'Race Start',
    icon: '🏎️',
    description: 'Formation lap and start procedures',
    situations: [
      { key: 'formation_lap', label: 'Formation lap', urgency: 'medium' },
      { key: 'lights_out',    label: 'Lights out',    urgency: 'high' },
      { key: 'good_start',    label: 'Good start',    urgency: 'medium' },
      { key: 'poor_start',    label: 'Poor start',    urgency: 'high' },
    ],
  },
  {
    key: 'session',
    label: 'Session Info',
    icon: '📋',
    description: 'Session timing and checkered flag',
    situations: [
      { key: 'session_start',   label: 'Session start',   urgency: 'low' },
      { key: 'halfway_point',   label: 'Halfway point',   urgency: 'low' },
      { key: 'final_laps',      label: 'Final laps',      urgency: 'medium' },
      { key: 'checkered_flag',  label: 'Checkered flag',  urgency: 'medium' },
    ],
  },
  {
    key: 'pace',
    label: 'Pace Management',
    icon: '⏱️',
    description: 'Lap time analysis and pace advice',
    situations: [
      { key: 'personal_best',       label: 'Personal best',       urgency: 'low' },
      { key: 'pace_drop',           label: 'Pace drop',           urgency: 'medium' },
      { key: 'consistent_pace',     label: 'Consistent pace',     urgency: 'low' },
      { key: 'sector_improvement',  label: 'Sector improvement',  urgency: 'low' },
    ],
  },
  {
    key: 'drs',
    label: 'DRS Zones',
    icon: '📡',
    description: 'DRS activation and deactivation',
    situations: [
      { key: 'drs_enabled',   label: 'DRS enabled',   urgency: 'low' },
      { key: 'drs_disabled',  label: 'DRS disabled',  urgency: 'low' },
      { key: 'drs_detection', label: 'DRS detection', urgency: 'medium' },
    ],
  },
  {
    key: 'penalties',
    label: 'Penalties',
    icon: '⛔',
    description: 'Track limits and penalty warnings',
    situations: [
      { key: 'track_limits_warning', label: 'Track limits warning', urgency: 'high' },
      { key: 'penalty_received',     label: 'Penalty received',     urgency: 'critical' },
      { key: 'penalty_served',       label: 'Penalty served',       urgency: 'medium' },
    ],
  },
  {
    key: 'team',
    label: 'Team Orders',
    icon: '📻',
    description: 'Team strategy and multi-car coordination',
    situations: [
      { key: 'hold_position',   label: 'Hold position',   urgency: 'high' },
      { key: 'swap_positions',  label: 'Swap positions',  urgency: 'high' },
      { key: 'push_hard',       label: 'Push hard',       urgency: 'medium' },
      { key: 'manage_gap',      label: 'Manage gap',      urgency: 'medium' },
    ],
  },
  {
    key: 'finish',
    label: 'Race Finish',
    icon: '🏆',
    description: 'Final lap and results',
    situations: [
      { key: 'last_lap',         label: 'Last lap',         urgency: 'high' },
      { key: 'finish_position',  label: 'Finish position',  urgency: 'medium' },
      { key: 'race_complete',    label: 'Race complete',    urgency: 'medium' },
    ],
  },
];

export const RADIO_CATEGORIES_BY_KEY: Record<string, CategoryDef> = Object.fromEntries(
  RADIO_CATEGORIES.map((c) => [c.key, c]),
);

export function urgencyFor(category: string, situation: string): Urgency {
  const cat = RADIO_CATEGORIES_BY_KEY[category];
  if (!cat) return 'medium';
  const sit = cat.situations.find((s) => s.key === situation);
  return sit?.urgency ?? 'medium';
}

export interface CategoryConfig {
  enabled: boolean;
  aiEnabled: boolean;
  situations: Record<string, boolean>;
}

export type RadioConfig = Record<string, CategoryConfig>;

export function defaultRadioConfig(): RadioConfig {
  const cfg: RadioConfig = {};
  for (const cat of RADIO_CATEGORIES) {
    const sits: Record<string, boolean> = {};
    for (const s of cat.situations) sits[s.key] = true;
    cfg[cat.key] = { enabled: true, aiEnabled: false, situations: sits };
  }
  return cfg;
}

/** Coerce loaded prefs into a valid config, dropping any unknown keys. */
export function normalizeRadioConfig(input: unknown): RadioConfig {
  const out = defaultRadioConfig();
  if (!input || typeof input !== 'object') return out;
  const raw = input as Record<string, any>;
  for (const cat of RADIO_CATEGORIES) {
    const src = raw[cat.key];
    if (!src || typeof src !== 'object') continue;
    out[cat.key].enabled    = src.enabled !== false;
    out[cat.key].aiEnabled  = src.aiEnabled === true;
    if (src.situations && typeof src.situations === 'object') {
      for (const sit of cat.situations) {
        if (Object.prototype.hasOwnProperty.call(src.situations, sit.key)) {
          out[cat.key].situations[sit.key] = src.situations[sit.key] !== false;
        }
      }
    }
  }
  return out;
}

/**
 * True if the situation should fire — checks both category-enabled and
 * situation-enabled bits. Unknown category/situation → false (silenced).
 */
export function isSituationEnabled(
  cfg: RadioConfig | null | undefined,
  category: string,
  situation: string,
): boolean {
  if (!cfg) return false;
  const cat = cfg[category];
  if (!cat || !cat.enabled) return false;
  if (!Object.prototype.hasOwnProperty.call(cat.situations, situation)) return false;
  return cat.situations[situation] !== false;
}

/** True if AI voice should be used for this category. */
export function isCategoryAi(cfg: RadioConfig | null | undefined, category: string): boolean {
  if (!cfg) return false;
  return cfg[category]?.aiEnabled === true;
}

export function formatSituationLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
