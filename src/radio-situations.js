// ─── Radio Situation Categories & Detection ──────────────────────────────────
// 14 categories, ~100 situations — all detectable from F1 25 UDP telemetry.
// Removed: Side-by-Side (undetectable), Multiplayer/AI (undetectable).
// Removed per-category: technique-specific, driver-intent, contact-type subs
// that cannot be inferred from speed/damage/status/lap/session UDP packets.

export const RADIO_CATEGORIES = {
  // ── 1. Start Phase ──────────────────────────────────────────────────────────
  start: {
    label: 'Start Phase',
    icon: '⚡',
    description: 'Race start, launch quality, position changes, cold tyres',
    situations: [
      'start_gained_places', 'start_lost_places',
      'start_grid_held', 'start_cold_tyres',
      'start_t1_jump',
    ],
  },

  // ── 2. Normal Race ──────────────────────────────────────────────────────────
  normal: {
    label: 'Normal Lap-by-Lap',
    icon: '↻',
    description: 'Clean/dirty air, fuel state, position updates, and slower traffic alerts',
    situations: [
      'clean_air', 'dirty_air', 'closing_slower', 'being_caught',
      'fuel_critical', 'fuel_recovered',
      'position_lost', 'outlap_clear', 'outlap_traffic', 'qualifying_lap_complete',
      'slower_car_ahead',
    ],
  },

  // ── 3. Overtaking ──────────────────────────────────────────────────────────
  overtake: {
    label: 'Overtaking',
    icon: '→',
    description: 'Position gains, attack calls, and overtaking opportunities',
    situations: [
      'position_gained', 'attack_scenario', 'mixed_scenario',
      'tyre_advantage_pass', 'damage_pass',
      'undercut_pass', 'overcut_pass',
      'sc_restart_pass', 'low_ers_pass',
      'rival_penalty',
    ],
  },

  // ── 4. Defending ───────────────────────────────────────────────────────────
  defend: {
    label: 'Defending',
    icon: '⛨',
    description: 'Defense scenarios, worn tyres, damage, and pressure',
    situations: [
      'defense_scenario', 'defend_low_battery', 'defend_worn_tyres',
      'defend_with_damage', 'defend_sc_restart',
      'defend_prolonged',
    ],
  },

  // ── 5. ERS ─────────────────────────────────────────────────────────────────
  ers: {
    label: 'ERS / Battery',
    icon: '⚡',
    description: 'Battery delta vs rivals (game already shows your battery %)',
    situations: [
      'battery_delta_ahead', 'battery_delta_behind',
    ],
  },

  // ── 7. Tyres ───────────────────────────────────────────────────────────────
  tyres: {
    label: 'Tyre Situations',
    icon: '◎',
    description: 'Wear, temperature, compound strategy, cliff, wet crossover',
    situations: [
      'tyres_warming_slow', 'tyres_overheating_dirty',
      'fl_wear_high', 'tyre_wear_critical', 'rear_overheating',
      'lockup_flat_spot', 'tyre_cliff', 'extending_stint',
      'inters_crossover', 'wets_crossover',
    ],
  },

  // ── 8. Pit Stops ───────────────────────────────────────────────────────────
  pit: {
    label: 'Pit Stop Situations',
    icon: '⊡',
    description: 'Planned stops, undercut/overcut, free stop SC, rejoining',
    situations: [
      'planned_stop', 'early_stop', 'late_stop',
      'undercut_attempt', 'overcut_attempt',
      'rejoin_traffic', 'rejoin_clean_air',
      'pit_limiter', 'pit_exit_new_tyres',
      'emergency_stop', 'free_stop_sc', 'serving_penalty',
      'late_race_hold_track', 'short_race_hold_track', 'weather_crossover_pit',
    ],
  },

  // ── 9. Weather ─────────────────────────────────────────────────────────────
  weather: {
    label: 'Weather Situations',
    icon: '☁',
    description: 'Rain transitions, crossover points, drying track',
    situations: [
      'light_rain_begins', 'rain_heavier', 'drying_track',
      'inter_crossover', 'wet_crossover', 'wrong_tyre_conditions', 'weather_change',
    ],
  },

  // ── 10. Flags & Safety Car ──────────────────────────────────────────────────
  flags: {
    label: 'Flags & Safety Car',
    icon: '⚑',
    description: 'Yellow, SC, VSC, red flag, neutralization, restart, and nearby hazards',
    situations: [
      'yellow_flag', 'blue_flag', 'double_yellow', 'no_overtaking',
      'vsc_deployed', 'vsc_delta', 'vsc_pit_opportunity',
      'sc_deployed', 'sc_pack_bunches', 'sc_pit_window',
      'sc_cold_tyres_restart', 'sc_leader_controls',
      'red_flag', 'red_free_tyre_change', 'flag_green', 'car_rejoining_track',
    ],
  },

  // ── 11. Restarts ───────────────────────────────────────────────────────────
  restart: {
    label: 'Restart Situations',
    icon: '▶',
    description: 'SC/VSC restarts and tyre temperatures',
    situations: [
      'sc_restart', 'vsc_ending', 'restart_green_go', 'easy_pass_cold_tyres',
    ],
  },

  // ── 12. Incidents & Damage ─────────────────────────────────────────────────
  incident: {
    label: 'Incidents & Damage',
    icon: '⚠',
    description: 'Wing/floor/engine damage, spin, gearbox/ERS faults',
    situations: [
      'front_wing_damage', 'wing_pit_required',
      'sidepod_floor_damage', 'engine_damage',
      'ers_fault', 'gearbox_damage',
      'spin', 'damage_continue',
    ],
  },

  // ── 13. Penalties ──────────────────────────────────────────────────────────
  penalty: {
    label: 'Penalties',
    icon: '⊘',
    description: 'Track limits, time penalties, pit speeding, serving penalty',
    situations: [
      'track_limits_warn', 'track_limits_penalty',
      'time_penalty', 'pit_speeding', 'serving_at_pit',
    ],
  },

  // ── 14. Racecraft & Tactics ─────────────────────────────────────────────────
  racecraft: {
    label: 'Racecraft & Tactics',
    icon: '♟',
    description: 'ERS/tyre age tactics, gap management, dirty air decisions',
    situations: [
      'save_battery_one_move', 'use_ers_wisely',
      'dont_sit_dirty_air',
      'tyre_preservation_battle', 'undercut_key',
    ],
  },

  // ── 15. End of Race ────────────────────────────────────────────────────────
  endrace: {
    label: 'End of Race',
    icon: '🏁',
    description: 'Final lap, battery empty, dead tyres',
    situations: [
      'final_lap_overtake', 'battery_empty_last', 'tyres_dead_finish',
      'push_no_saving', 'fuel_ers_final_attack',
    ],
  },
};

// Default: all categories enabled, AI voice disabled (requires purchase)
export function getDefaultRadioConfig() {
  const config = {};
  for (const [key, cat] of Object.entries(RADIO_CATEGORIES)) {
    config[key] = { enabled: true, aiEnabled: false, situations: {} };
    for (const sit of cat.situations) {
      config[key].situations[sit] = true;
    }
  }
  return config;
}

// Count how many categories have aiEnabled = true (for pricing estimate)
export function countAiEnabledSituations(radioConfig) {
  let count = 0;
  for (const [key, cat] of Object.entries(RADIO_CATEGORIES)) {
    const cfg = radioConfig[key];
    if (!cfg?.aiEnabled) continue;
    for (const sit of cat.situations) {
      if (cfg.situations?.[sit] !== false) count++;
    }
  }
  return count;
}

// ── Pre-written message templates ─────────────────────────────────────────────
// Functions receive context object and return {text, urgency} or null.

export const RADIO_MESSAGES = {
  // ── Start Phase ──
  start_good_launch: (ctx) => ({
    text: `Great start! Gained ${ctx.placesGained} place${ctx.placesGained > 1 ? 's' : ''} off the line. Keep it clean.`,
    urgency: 'medium',
  }),
  start_bad_launch: () => ({
    text: 'Poor getaway. Stay calm, focus on the first corners. We can recover.',
    urgency: 'high',
  }),
  start_cold_tyres: (ctx) => ({
    text: `Tyres at ${ctx.avgTemp}°C. Cold. Be careful on turn-in and braking for the first two laps.`,
    urgency: 'medium',
  }),
  start_cold_brakes: () => ({
    text: 'Brakes are cold. Pump them early into the first heavy braking zone.',
    urgency: 'medium',
  }),
  start_gained_places: (ctx) => ({
    text: `Good start! Up to P${ctx.position} from P${ctx.grid}. ${ctx.placesGained} places gained. Now settle in.`,
    urgency: 'medium',
  }),
  start_lost_places: (ctx) => ({
    text: `Lost ${ctx.placesLost} place${ctx.placesLost > 1 ? 's' : ''} at the start. P${ctx.position} now. Stay patient, long race ahead.`,
    urgency: 'high',
  }),
  start_wing_damage: (ctx) => ({
    text: `Front wing damage at the start — ${ctx.pct}%. Balance will be off. Box when the opportunity arises.`,
    urgency: 'high',
  }),

  // ── Normal Race ──
  normal_dirty_air: (ctx) => ({
    text: `${(ctx.gapMs / 1000).toFixed(1)}s behind ${ctx.aheadName}. Dirty air heating the fronts. Manage the gap or commit to the pass.`,
    urgency: 'low',
  }),
  normal_clean_air: () => ({
    text: 'Clean air. Good gap. Focus on pace and tyre management.',
    urgency: 'low',
  }),
  normal_slower_car_ahead: (ctx) => ({
    text: `Slower car ahead, ${ctx.distanceMeters} metres.`,
    urgency: 'medium',
  }),
  normal_closing: (ctx) => ({
    text: `Closing on ${ctx.aheadName}. Gap down to ${(ctx.gapMs / 1000).toFixed(1)}s. Be ready for DRS range.`,
    urgency: 'low',
  }),
  normal_being_caught: (ctx) => ({
    text: `${ctx.behindName} is closing. Gap now ${(ctx.gapMs / 1000).toFixed(1)}s. Watch the mirrors.`,
    urgency: 'medium',
  }),
  normal_lockup: () => ({
    text: 'Lock-up detected. Watch the flat spot. Adjust braking for the next few laps.',
    urgency: 'medium',
  }),
  normal_track_limits: () => ({
    text: "Track limits. Keep it tidy — you don't want a warning.",
    urgency: 'medium',
  }),
  normal_brake_overheating: (ctx) => ({
    text: `Brake temps high — ${ctx.maxBrakeTemp}°C. Lift earlier into heavy braking zones.`,
    urgency: 'high',
  }),
  normal_tyre_overheating: (ctx) => ({
    text: `${ctx.hotTyre} tyre overheating at ${ctx.temp}°C. Back off and let them cool.`,
    urgency: 'medium',
  }),

  // ── Overtaking ──
  overtake_battery_advantage: (ctx) => ({
    text: `Battery advantage: you have ${ctx.deltaPct.toFixed(0)}% more than ${ctx.rivalName}. Use it on the straight.`,
    urgency: 'medium',
  }),
  overtake_rival_damage: (ctx) => ({
    text: `${ctx.rivalName} has damage: ${ctx.damageList}. Exploit their weakness.`,
    urgency: 'medium',
  }),
  overtake_drs_ers_combined: (ctx) => ({
    text: `DRS + full battery. This is your chance on ${ctx.rivalName}. Commit to the move.`,
    urgency: 'high',
  }),
  overtake_tyre_advantage: (ctx) => ({
    text: `Your tyres are ${ctx.tyreDeltaLaps} laps fresher than ${ctx.rivalName}. Pressure them on exit.`,
    urgency: 'medium',
  }),
  overtake_rival_penalty: (ctx) => ({
    text: `${ctx.rivalName} has a penalty. Position coming to you — hold the gap.`,
    urgency: 'medium',
  }),

  // ── Defending ──
  defend_battery_disadvantage: (ctx) => ({
    text: `${ctx.rivalName} has ${Math.abs(ctx.deltaPct).toFixed(0)}% more battery. Defend the inside on the straight.`,
    urgency: 'high',
  }),
  defend_rival_fresher_tyres: (ctx) => ({
    text: `${ctx.rivalName} on ${ctx.tyreDeltaLaps}-lap fresher tyres. They'll be stronger on exit. Defend the apex.`,
    urgency: 'high',
  }),
  defend_rival_drs: (ctx) => ({
    text: `${ctx.rivalName} has DRS. Cover the inside and brake late. Don't give them the corner.`,
    urgency: 'high',
  }),
  defend_prolonged: (ctx) => ({
    text: `${ctx.rivalName} still behind after ${ctx.lapsBehind} laps. Keep doing what you're doing. Don't over-push.`,
    urgency: 'low',
  }),

  // ── Battle Battery Delta ──
  battle_battery_ahead: (ctx) => ({
    text: `Battery delta: +${ctx.deltaPct.toFixed(0)}% vs ${ctx.rivalName} ahead. ${ctx.deltaPct > 15 ? 'Big advantage — deploy on the next straight.' : 'Small edge. Time it right.'}`,
    urgency: ctx.deltaPct > 15 ? 'high' : 'medium',
  }),
  battle_battery_behind: (ctx) => ({
    text: `${ctx.rivalName} behind has ${Math.abs(ctx.deltaPct).toFixed(0)}% more battery. ${Math.abs(ctx.deltaPct) > 15 ? 'Vulnerable on the straight. Defend early.' : 'Manageable. Hold your line.'}`,
    urgency: Math.abs(ctx.deltaPct) > 15 ? 'high' : 'medium',
  }),
  battle_battery_ahead_advantage: (ctx) => ({
    text: `You have ${ctx.deltaPct.toFixed(0)}% battery advantage over ${ctx.rivalName}. Straight coming up — deploy now!`,
    urgency: 'high',
  }),
  battle_rival_ahead_damaged: (ctx) => ({
    text: `${ctx.rivalName} ahead has ${ctx.damageDesc}. They'll be slower. Attack.`,
    urgency: 'medium',
  }),
  battle_rival_behind_damaged: (ctx) => ({
    text: `${ctx.rivalName} behind has ${ctx.damageDesc}. Less threat from them. Focus on your pace.`,
    urgency: 'low',
  }),

  // ── DRS ──
  drs_gained: (ctx) => ({
    text: `DRS! ${(ctx.gapMs / 1000).toFixed(2)}s to ${ctx.aheadName}. Deploy with ERS on the straight.`,
    urgency: 'medium',
  }),
  drs_lost_barely: (ctx) => ({
    text: `Missed DRS by ${((ctx.gapMs - 1000) / 1000).toFixed(2)}s. Close the gap through the corners.`,
    urgency: 'low',
  }),
  drs_car_behind: (ctx) => ({
    text: `${ctx.behindName} has DRS on you. Cover the inside into the braking zone.`,
    urgency: 'high',
  }),
  drs_train: (ctx) => ({
    text: `DRS train — ${ctx.carsInTrain} cars. Hard to pass. Be patient or try the undercut.`,
    urgency: 'low',
  }),

  // ── ERS ──
  ers_full_attack: () => ({
    text: 'Battery at 100%. Full deploy. Attack mode — use it all.',
    urgency: 'medium',
  }),
  ers_low_defense: (ctx) => ({
    text: `Battery at ${ctx.ersPct.toFixed(0)}%. Save for the key straight. Harvest in corners.`,
    urgency: 'high',
  }),
  ers_drain_overtake: () => ({
    text: "Battery draining for the pass. Make it count — you won't have energy for another attempt.",
    urgency: 'high',
  }),

  // ── Tyres ──
  tyre_cliff: (ctx) => ({
    text: `Tyre cliff! ${ctx.tyre} at ${ctx.wear}% and lap time dropping fast. Box this lap if possible.`,
    urgency: 'critical',
  }),
  tyre_extend_stint: (ctx) => ({
    text: `Extending stint. Tyres at ${ctx.wear}% but pace is still there. ${ctx.lapsToGo} laps to target.`,
    urgency: 'low',
  }),
  tyre_fl_high_wear: (ctx) => ({
    text: `FL tyre at ${ctx.wear}%. Ease off the kerbs and open your entry line.`,
    urgency: 'medium',
  }),
  tyre_rear_overheating: (ctx) => ({
    text: `Rear tyres at ${ctx.temp}°C. Dirty air cooking them. Create a gap or let them cool.`,
    urgency: 'medium',
  }),
  tyre_inters_crossover: () => ({
    text: 'Inter crossover point reached. Inters will be faster now. Consider the switch.',
    urgency: 'high',
  }),
  tyre_wets_crossover: () => ({
    text: 'Track drying up. Racing line is faster. Consider switch to slicks.',
    urgency: 'medium',
  }),

  // ── Pit ──
  pit_undercut_threat: (ctx) => ({
    text: `${ctx.rivalName} has pitted. Undercut threat! We may need to respond ${ctx.urgentLaps ? 'in ' + ctx.urgentLaps + ' laps' : 'soon'}.`,
    urgency: 'high',
  }),
  pit_overcut_opportunity: () => ({
    text: 'Rivals pitting. Stay out and use clean air. Overcut opportunity.',
    urgency: 'medium',
  }),
  pit_free_stop_sc: () => ({
    text: 'Safety car! Free pit stop. Box box box!',
    urgency: 'critical',
  }),
  pit_rejoin_traffic: () => ({
    text: 'Out of the pits in traffic. Manage the tyres for two laps before pushing.',
    urgency: 'low',
  }),
  pit_rejoin_clean: () => ({
    text: 'Clean air out of the pits. Push hard and build the gap.',
    urgency: 'medium',
  }),

  // ── Weather ──
  weather_rain_starting: () => ({
    text: 'First drops of rain. Track getting slippery. Watch grip on corner entry.',
    urgency: 'high',
  }),
  weather_inters_crossover: () => ({
    text: 'Inter crossover point reached. Inters will be faster now. Consider the switch.',
    urgency: 'high',
  }),
  weather_drying: () => ({
    text: 'Track drying up. Racing line is faster. Consider switch to slicks.',
    urgency: 'medium',
  }),
  weather_rain_heavier: () => ({
    text: 'Rain getting heavier. Slicks losing grip fast. Ready to call you in.',
    urgency: 'high',
  }),

  // ── Flags ──
  flag_yellow: () => ({
    text: 'Yellow flag. No overtaking.',
    urgency: 'critical',
  }),
  flag_rejoining_track: (ctx) => ({
    text: `${ctx.rivalName} rejoining track, ${ctx.distanceMeters} metres.`,
    urgency: 'high',
  }),
  flag_sc: () => ({
    text: 'Safety car deployed! Close up to the pack. Consider pit strategy.',
    urgency: 'critical',
  }),
  flag_vsc: () => ({
    text: 'Virtual safety car. Maintain delta. Good time to pit if the window is right.',
    urgency: 'critical',
  }),
  flag_red: () => ({
    text: 'Red flag! Race stopped. Return to the pits. Free tyre change opportunity.',
    urgency: 'critical',
  }),
  flag_green: () => ({
    text: 'Green green green! Go go go!',
    urgency: 'high',
  }),

  // ── Restart ──
  restart_sc: () => ({
    text: 'Safety car in this lap. Get heat in the tyres and brakes. Ready for the restart.',
    urgency: 'high',
  }),
  restart_vsc_ending: () => ({
    text: 'VSC ending. Racing resumes.',
    urgency: 'high',
  }),
  restart_go: () => ({
    text: 'Green, green. Go, go, go.',
    urgency: 'high',
  }),

  // ── Incidents & Damage ──
  incident_wing_damage: (ctx) => ({
    text: `Front wing damage — ${ctx.side} at ${ctx.pct}%. Balance will shift. Adjust your driving.`,
    urgency: 'high',
  }),
  incident_floor_damage: (ctx) => ({
    text: `Floor damage at ${ctx.pct}%. Downforce reduced. You'll feel it in high-speed corners.`,
    urgency: 'high',
  }),
  incident_engine_damage: (ctx) => ({
    text: `Engine wear high — ${ctx.pct}%. Watch the temperatures. Don't push the limiter.`,
    urgency: 'high',
  }),
  incident_drs_fault: () => ({
    text: 'DRS fault. System unavailable this race. Compensate with ERS on the straights.',
    urgency: 'high',
  }),
  incident_ers_fault: () => ({
    text: 'ERS fault detected. Battery deployment unreliable. Adjust your attack/defense plan.',
    urgency: 'high',
  }),
  incident_spin: () => ({
    text: 'Spin! Get it going again, check for damage. Watch for traffic.',
    urgency: 'critical',
  }),

  // ── Penalties ──
  penalty_track_limits: (ctx) => ({
    text: `Track limits warning${ctx.count ? ` (${ctx.count})` : ''}. One more and it's a penalty.`,
    urgency: 'medium',
  }),
  penalty_time: (ctx) => ({
    text: `${ctx.seconds}s time penalty. Will be served at next pit stop. Push to build the gap.`,
    urgency: 'high',
  }),
  penalty_pit_speeding: () => ({
    text: 'Pit lane speeding penalty. Avoid pit lane speed violations — limiter on entry.',
    urgency: 'high',
  }),

  // ── Racecraft ──
  racecraft_save_battery: () => ({
    text: 'Save the battery. One clean deployment when you need it — not a dozen small bursts.',
    urgency: 'low',
  }),
  racecraft_dont_sit_dirty: (ctx) => ({
    text: `You've been in ${ctx.aheadName}'s dirty air for ${ctx.laps} laps. Either commit to the pass or back off.`,
    urgency: 'medium',
  }),
  racecraft_tyre_delta: (ctx) => ({
    text: `${ctx.rivalName} is on ${ctx.tyreDeltaLaps}-lap older tyres. They'll brake earlier and have worse traction.`,
    urgency: 'low',
  }),
  racecraft_fresher_tyres: (ctx) => ({
    text: `You're on ${ctx.tyreDeltaLaps}-lap fresher rubber than ${ctx.rivalName}. Use the rotation advantage and pressure on exit.`,
    urgency: 'low',
  }),

  // ── End Race ──
  endrace_final_lap: (ctx) => ({
    text: `Last lap! P${ctx.position}. ${ctx.gapAheadMs > 0 && ctx.gapAheadMs < 2000 ? 'Car ahead in range — give it everything!' : 'Bring it home clean.'}`,
    urgency: 'high',
  }),
  endrace_battery_empty: () => ({
    text: 'Battery empty for the final lap. No ERS. Defend on driving alone.',
    urgency: 'high',
  }),
  endrace_push_no_saving: () => ({
    text: 'Final laps. No need to save anything. Full send!',
    urgency: 'medium',
  }),
  endrace_fuel_ers_attack: () => ({
    text: 'Last laps. Lean on the ERS and use remaining fuel. Everything for position.',
    urgency: 'medium',
  }),
};
