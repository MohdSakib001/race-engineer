import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── TRACK MAP DATA (simplified SVG paths for each circuit) ───────────────
const TRACK_MAPS = {
  Melbourne: {
    name: "Albert Park", country: "Australia", laps: 58, length: "5.278 km",
    drsZones: 4, overtakeCorners: [1, 3, 11, 13],
    path: "M 80,40 C 100,30 130,25 160,30 C 190,35 210,50 220,75 C 230,100 225,130 210,150 C 195,170 170,180 145,185 C 120,190 95,185 75,170 C 55,155 45,130 40,105 C 35,80 45,55 60,43 Z",
    corners: [{x:160,y:30,n:1},{x:220,y:75,n:3},{x:210,y:150,n:6},{x:145,y:185,n:9},{x:75,y:170,n:11},{x:40,y:105,n:13},{x:80,y:40,n:16}],
    startFinish: {x:80,y:40}
  },
  Bahrain: {
    name: "Bahrain Intl.", country: "Bahrain", laps: 57, length: "5.412 km",
    drsZones: 3, overtakeCorners: [1, 4, 11],
    path: "M 60,50 L 200,50 C 215,50 225,60 225,75 L 225,100 L 160,100 L 160,130 L 225,130 L 225,170 C 225,185 215,195 200,195 L 60,195 C 45,195 35,185 35,170 L 35,75 C 35,60 45,50 60,50 Z",
    corners: [{x:200,y:50,n:1},{x:225,y:100,n:4},{x:160,y:100,n:5},{x:160,y:130,n:8},{x:225,y:170,n:10},{x:60,y:195,n:13},{x:35,y:75,n:15}],
    startFinish: {x:130,y:50}
  },
  Jeddah: {
    name: "Jeddah Corniche", country: "Saudi Arabia", laps: 50, length: "6.174 km",
    drsZones: 3, overtakeCorners: [1, 22, 27],
    path: "M 50,180 L 50,40 C 50,30 60,25 70,30 L 120,55 L 130,45 L 200,45 C 210,45 215,55 210,65 L 180,100 L 210,130 C 215,140 210,150 200,150 L 130,150 L 100,180 Z",
    corners: [{x:50,y:40,n:1},{x:120,y:55,n:4},{x:200,y:45,n:13},{x:180,y:100,n:22},{x:200,y:150,n:25},{x:100,y:180,n:27}],
    startFinish: {x:50,y:180}
  },
  Shanghai: {
    name: "Shanghai Intl.", country: "China", laps: 56, length: "5.451 km",
    drsZones: 2, overtakeCorners: [1, 6, 14],
    path: "M 130,45 L 200,45 C 220,45 230,60 220,75 L 180,110 C 170,120 175,135 185,140 L 220,155 C 230,160 230,175 220,180 L 130,180 C 110,180 90,170 80,155 L 50,100 C 40,80 50,55 75,50 Z",
    corners: [{x:200,y:45,n:1},{x:220,y:75,n:2},{x:180,y:110,n:6},{x:185,y:140,n:8},{x:220,y:180,n:11},{x:80,y:155,n:14},{x:75,y:50,n:16}],
    startFinish: {x:130,y:45}
  },
  Miami: {
    name: "Miami Intl.", country: "USA", laps: 57, length: "5.412 km",
    drsZones: 3, overtakeCorners: [1, 11, 17],
    path: "M 60,60 L 200,60 C 215,60 225,70 225,85 L 225,120 L 170,120 L 170,155 L 225,155 L 225,175 C 225,190 215,200 200,200 L 60,200 C 45,200 35,190 35,175 L 35,85 C 35,70 45,60 60,60 Z",
    corners: [{x:200,y:60,n:1},{x:225,y:120,n:4},{x:170,y:120,n:7},{x:170,y:155,n:11},{x:225,y:175,n:14},{x:60,y:200,n:17},{x:35,y:85,n:19}],
    startFinish: {x:130,y:60}
  },
  Imola: {
    name: "Autodromo Enzo e Dino Ferrari", country: "Italy", laps: 63, length: "4.909 km",
    drsZones: 2, overtakeCorners: [2, 7],
    path: "M 50,120 L 120,40 C 130,30 145,30 155,40 L 210,100 C 220,115 215,135 200,145 L 130,180 C 115,188 95,185 85,172 L 50,130 Z",
    corners: [{x:120,y:40,n:2},{x:155,y:40,n:4},{x:210,y:100,n:7},{x:200,y:145,n:11},{x:130,y:180,n:14},{x:50,y:120,n:17}],
    startFinish: {x:50,y:120}
  },
  Monaco: {
    name: "Circuit de Monaco", country: "Monaco", laps: 78, length: "3.337 km",
    drsZones: 1, overtakeCorners: [1],
    path: "M 40,80 L 90,40 L 180,40 C 200,40 210,55 200,70 L 160,120 L 210,160 C 220,175 210,190 190,190 L 80,190 C 60,190 45,175 45,155 L 40,80 Z",
    corners: [{x:90,y:40,n:1},{x:180,y:40,n:3},{x:200,y:70,n:6},{x:160,y:120,n:10},{x:210,y:160,n:15},{x:80,y:190,n:18},{x:40,y:80,n:19}],
    startFinish: {x:40,y:80}
  },
  Catalunya: {
    name: "Circuit de Barcelona-Catalunya", country: "Spain", laps: 66, length: "4.657 km",
    drsZones: 2, overtakeCorners: [1, 10],
    path: "M 55,80 L 180,45 C 195,42 210,50 215,65 L 230,120 C 235,135 225,150 210,152 L 140,155 L 100,190 C 85,200 65,195 55,180 L 35,120 C 30,100 38,85 55,80 Z",
    corners: [{x:180,y:45,n:1},{x:215,y:65,n:3},{x:230,y:120,n:5},{x:140,y:155,n:7},{x:100,y:190,n:10},{x:55,y:180,n:13},{x:55,y:80,n:16}],
    startFinish: {x:55,y:80}
  },
  Montreal: {
    name: "Circuit Gilles Villeneuve", country: "Canada", laps: 70, length: "4.361 km",
    drsZones: 2, overtakeCorners: [1, 10, 13],
    path: "M 40,100 L 40,40 L 100,40 L 140,70 L 140,40 L 220,40 L 220,100 L 180,140 L 220,180 L 220,200 L 40,200 L 40,140 Z",
    corners: [{x:40,y:40,n:1},{x:100,y:40,n:3},{x:140,y:70,n:6},{x:220,y:40,n:8},{x:220,y:100,n:10},{x:180,y:140,n:12},{x:220,y:200,n:13},{x:40,y:200,n:14}],
    startFinish: {x:40,y:100}
  },
  Silverstone: {
    name: "Silverstone Circuit", country: "Great Britain", laps: 52, length: "5.891 km",
    drsZones: 2, overtakeCorners: [6, 16],
    path: "M 100,45 L 190,45 L 225,80 L 225,120 L 185,150 L 225,185 L 190,215 L 70,215 L 35,185 L 35,120 L 70,90 L 35,65 Z",
    corners: [{x:190,y:45,n:1},{x:225,y:80,n:3},{x:225,y:120,n:6},{x:185,y:150,n:9},{x:190,y:215,n:12},{x:70,y:215,n:14},{x:35,y:120,n:16},{x:35,y:65,n:18}],
    startFinish: {x:100,y:45}
  },
  Hungaroring: {
    name: "Hungaroring", country: "Hungary", laps: 70, length: "4.381 km",
    drsZones: 2, overtakeCorners: [1, 2],
    path: "M 60,60 L 200,60 C 220,60 230,80 220,95 L 190,140 C 180,155 185,175 200,180 L 200,200 L 60,200 C 40,200 30,185 35,170 L 50,130 C 55,115 45,95 35,90 L 35,75 C 35,65 45,60 60,60 Z",
    corners: [{x:200,y:60,n:1},{x:220,y:95,n:2},{x:190,y:140,n:4},{x:200,y:180,n:6},{x:200,y:200,n:9},{x:60,y:200,n:11},{x:50,y:130,n:12},{x:35,y:90,n:14}],
    startFinish: {x:130,y:60}
  },
  Spa: {
    name: "Circuit de Spa-Francorchamps", country: "Belgium", laps: 44, length: "7.004 km",
    drsZones: 2, overtakeCorners: [1, 5, 18],
    path: "M 40,170 L 40,120 L 70,80 L 120,60 L 170,40 L 220,60 L 220,100 L 190,130 L 220,160 L 220,190 L 160,200 L 100,190 Z",
    corners: [{x:40,y:120,n:1},{x:70,y:80,n:3},{x:120,y:60,n:5},{x:220,y:60,n:7},{x:220,y:100,n:9},{x:190,y:130,n:14},{x:220,y:190,n:18},{x:100,y:190,n:19}],
    startFinish: {x:40,y:170}
  },
  Monza: {
    name: "Autodromo Nazionale Monza", country: "Italy", laps: 53, length: "5.793 km",
    drsZones: 2, overtakeCorners: [1, 4, 8],
    path: "M 50,180 L 50,70 C 50,50 70,40 90,45 L 170,70 C 190,75 200,60 195,45 L 210,45 L 210,120 C 210,140 195,155 175,155 L 120,150 L 100,180 Z",
    corners: [{x:50,y:70,n:1},{x:90,y:45,n:2},{x:195,y:45,n:4},{x:210,y:120,n:6},{x:175,y:155,n:8},{x:100,y:180,n:10},{x:50,y:180,n:11}],
    startFinish: {x:50,y:180}
  },
  Baku: {
    name: "Baku City Circuit", country: "Azerbaijan", laps: 51, length: "6.003 km",
    drsZones: 2, overtakeCorners: [1, 3],
    path: "M 40,190 L 40,50 L 60,30 L 220,30 L 220,80 L 180,80 L 180,140 L 220,140 L 220,190 Z",
    corners: [{x:40,y:50,n:1},{x:60,y:30,n:3},{x:220,y:30,n:7},{x:220,y:80,n:8},{x:180,y:80,n:12},{x:180,y:140,n:16},{x:220,y:190,n:19}],
    startFinish: {x:130,y:190}
  },
  Singapore: {
    name: "Marina Bay Street Circuit", country: "Singapore", laps: 62, length: "4.940 km",
    drsZones: 3, overtakeCorners: [5, 7, 14],
    path: "M 50,50 L 200,50 L 200,100 L 160,100 L 160,140 L 200,140 L 200,200 L 50,200 L 50,140 L 90,140 L 90,100 L 50,100 Z",
    corners: [{x:200,y:50,n:1},{x:200,y:100,n:5},{x:160,y:100,n:7},{x:160,y:140,n:9},{x:200,y:200,n:14},{x:50,y:200,n:16},{x:50,y:140,n:19},{x:50,y:50,n:23}],
    startFinish: {x:125,y:50}
  },
  Suzuka: {
    name: "Suzuka Circuit", country: "Japan", laps: 53, length: "5.807 km",
    drsZones: 2, overtakeCorners: [1, 11],
    path: "M 100,45 C 130,40 160,55 170,80 C 180,105 160,130 135,135 C 110,140 100,160 110,180 C 120,200 150,205 175,195 C 200,185 215,160 210,130 C 205,100 185,80 165,70 L 100,45 Z",
    corners: [{x:170,y:80,n:1},{x:135,y:135,n:3},{x:110,y:180,n:7},{x:175,y:195,n:11},{x:210,y:130,n:14},{x:165,y:70,n:17}],
    startFinish: {x:100,y:45}
  },
  Austin: {
    name: "Circuit of the Americas", country: "USA", laps: 56, length: "5.513 km",
    drsZones: 2, overtakeCorners: [1, 12],
    path: "M 50,100 L 80,40 L 140,40 L 200,70 L 220,120 L 200,160 L 140,180 L 100,200 L 50,180 L 35,140 Z",
    corners: [{x:80,y:40,n:1},{x:140,y:40,n:3},{x:200,y:70,n:6},{x:220,y:120,n:9},{x:200,y:160,n:12},{x:100,y:200,n:15},{x:50,y:180,n:18},{x:50,y:100,n:20}],
    startFinish: {x:50,y:100}
  },
  Mexico: {
    name: "Autódromo Hermanos Rodríguez", country: "Mexico", laps: 71, length: "4.304 km",
    drsZones: 3, overtakeCorners: [1, 4],
    path: "M 60,60 L 200,60 L 200,120 L 160,120 L 160,160 L 200,180 L 200,200 L 60,200 C 40,200 30,180 40,165 L 60,120 C 65,105 55,90 45,90 L 35,90 L 35,75 C 35,65 45,60 60,60 Z",
    corners: [{x:200,y:60,n:1},{x:200,y:120,n:4},{x:160,y:160,n:7},{x:200,y:200,n:11},{x:60,y:200,n:13},{x:60,y:120,n:15},{x:35,y:90,n:17}],
    startFinish: {x:130,y:60}
  },
  Brazil: {
    name: "Autódromo José Carlos Pace", country: "Brazil", laps: 71, length: "4.309 km",
    drsZones: 2, overtakeCorners: [1, 4],
    path: "M 200,190 L 200,80 C 200,60 185,50 170,55 L 80,90 C 60,98 50,85 55,70 L 60,50 C 65,35 80,30 95,35 L 200,55 L 210,80 L 210,200 Z",
    corners: [{x:200,y:80,n:1},{x:170,y:55,n:4},{x:80,y:90,n:6},{x:55,y:70,n:8},{x:95,y:35,n:10},{x:200,y:55,n:12},{x:200,y:190,n:15}],
    startFinish: {x:200,y:190}
  },
  LasVegas: {
    name: "Las Vegas Strip Circuit", country: "USA", laps: 50, length: "6.201 km",
    drsZones: 2, overtakeCorners: [1, 14],
    path: "M 130,200 L 50,200 L 50,50 L 80,50 L 80,140 L 180,140 L 180,50 L 210,50 L 210,200 Z",
    corners: [{x:50,y:200,n:1},{x:50,y:50,n:5},{x:80,y:50,n:6},{x:80,y:140,n:9},{x:180,y:140,n:12},{x:180,y:50,n:14},{x:210,y:50,n:15},{x:210,y:200,n:17}],
    startFinish: {x:130,y:200}
  },
  Losail: {
    name: "Lusail Intl. Circuit", country: "Qatar", laps: 57, length: "5.419 km",
    drsZones: 2, overtakeCorners: [1, 6],
    path: "M 60,180 L 60,80 C 60,55 80,40 105,40 L 170,40 C 195,40 215,55 215,80 L 215,140 C 215,165 195,180 170,180 Z",
    corners: [{x:60,y:80,n:1},{x:105,y:40,n:4},{x:170,y:40,n:6},{x:215,y:80,n:10},{x:215,y:140,n:12},{x:170,y:180,n:14},{x:60,y:180,n:16}],
    startFinish: {x:60,y:180}
  },
  AbuDhabi: {
    name: "Yas Marina Circuit", country: "Abu Dhabi", laps: 58, length: "5.281 km",
    drsZones: 2, overtakeCorners: [6, 9],
    path: "M 50,100 L 80,40 L 180,40 L 210,80 L 210,120 L 180,150 L 210,180 L 180,210 L 80,210 L 50,180 L 50,100 Z",
    corners: [{x:80,y:40,n:1},{x:180,y:40,n:3},{x:210,y:80,n:6},{x:210,y:120,n:7},{x:180,y:150,n:9},{x:180,y:210,n:11},{x:80,y:210,n:13},{x:50,y:100,n:16}],
    startFinish: {x:50,y:100}
  },
};

// ─── RULE-BASED RACE ENGINEER (no AI calls) ───────────────────────────────
const RACE_BUCKETS = {
  start: {
    label: "Race Start", icon: "🏁",
    triggers: (ctx) => ctx.currentLap <= 2 && ctx.session === "Race",
    advice: (ctx) => {
      const msgs = [];
      if (ctx.currentLap === 1) {
        msgs.push({ urgency: "critical", text: "Lights out. Get a clean start, avoid incident T1. Don't overcommit on lap 1." });
        if (ctx.tyreCompound === "Soft") msgs.push({ urgency: "high", text: "On softs — good launch grip but manage wheelspin off the line." });
        if (ctx.tyreCompound === "Medium") msgs.push({ urgency: "medium", text: "Mediums — decent launch, protect tyre temp through lap 1." });
        if (ctx.tyreCompound === "Hard") msgs.push({ urgency: "medium", text: "Hards — cold tyres, be cautious in braking zones until they come up to temp." });
        if (ctx.weather === "Light Rain" || ctx.weather === "Heavy Rain") msgs.push({ urgency: "critical", text: "Wet conditions — extra braking distance, avoid kerbs on lap 1." });
      }
      if (ctx.currentLap === 2) msgs.push({ urgency: "low", text: "Settle into rhythm. Build tyre temps gradually." });
      return msgs;
    }
  },
  overtaking: {
    label: "Overtaking", icon: "⚔️",
    triggers: (ctx) => ctx.gapToCarAheadMs > 0 && ctx.gapToCarAheadMs < 1200,
    advice: (ctx) => {
      const msgs = [];
      const gap = (ctx.gapToCarAheadMs / 1000).toFixed(2);
      const rival = ctx.carAhead;
      msgs.push({ urgency: "high", text: `Attack mode — ${rival?.name || 'car ahead'} is ${gap}s ahead.` });
      // Better exit
      if (ctx.drsAllowed) msgs.push({ urgency: "high", text: "DRS available — use the straight to close and pass." });
      if (ctx.ersStoreMJ > 2.0) msgs.push({ urgency: "medium", text: `Good ERS reserve (${ctx.ersStoreMJ} MJ). Deploy on straights for overtake.` });
      if (rival?.tyreAgeLaps != null && ctx.tyreAgeLaps != null && ctx.tyreAgeLaps < rival.tyreAgeLaps - 5) {
        msgs.push({ urgency: "high", text: `Tyre advantage — you're ${rival.tyreAgeLaps - ctx.tyreAgeLaps} laps fresher. Exploit corner exit grip.` });
      }
      if (rival?.ersStoreMJ != null && ctx.ersStoreMJ > rival.ersStoreMJ + 0.5) {
        msgs.push({ urgency: "medium", text: "You have more battery. Use ERS on exit to carry more speed." });
      }
      if (ctx.gapToCarAheadMs < 500) msgs.push({ urgency: "critical", text: "Under half a second — commit to the move or back off cleanly." });
      return msgs;
    }
  },
  defending: {
    label: "Defending", icon: "🛡️",
    triggers: (ctx) => ctx.carBehind && ctx.carBehind.gapToThemMs != null && ctx.carBehind.gapToThemMs < 1000 && ctx.carBehind.gapToThemMs > 0,
    advice: (ctx) => {
      const msgs = [];
      const gap = ((ctx.carBehind?.gapToThemMs || 0) / 1000).toFixed(2);
      const rival = ctx.carBehind;
      msgs.push({ urgency: "high", text: `Defend — ${rival?.name || 'car behind'} is ${gap}s back and closing.` });
      msgs.push({ urgency: "medium", text: "Cover the inside line into braking zones. One move only." });
      msgs.push({ urgency: "medium", text: "Brake under control — don't lock up trying to defend late." });
      if (rival?.ersStoreMJ != null && rival.ersStoreMJ > (ctx.ersStoreMJ || 0) + 0.5) {
        msgs.push({ urgency: "high", text: "Car behind has more ERS. Use battery wisely on exits, not just straights." });
      }
      if (rival?.tyreAgeLaps != null && ctx.tyreAgeLaps != null && rival.tyreAgeLaps < ctx.tyreAgeLaps - 5) {
        msgs.push({ urgency: "high", text: "They have fresher tyres. Protect exits — they'll be quicker through corners." });
      }
      msgs.push({ urgency: "low", text: "Strong exit speed is your best defence. Nail the apex." });
      return msgs;
    }
  },
  tyreWear: {
    label: "Tyre Management", icon: "🔄",
    triggers: (ctx) => ctx.tyreWearPct && Math.max(ctx.tyreWearPct.FL || 0, ctx.tyreWearPct.FR || 0, ctx.tyreWearPct.RL || 0, ctx.tyreWearPct.RR || 0) > 30,
    advice: (ctx) => {
      const msgs = [];
      const w = ctx.tyreWearPct || {};
      const maxWear = Math.max(w.FL || 0, w.FR || 0, w.RL || 0, w.RR || 0);
      const worst = Object.entries(w).sort((a, b) => b[1] - a[1])[0];
      if (maxWear > 70) {
        msgs.push({ urgency: "critical", text: `${worst[0]} at ${worst[1]}% wear — box this lap or risk a puncture.` });
      } else if (maxWear > 55) {
        msgs.push({ urgency: "high", text: `${worst[0]} at ${worst[1]}% wear — tyre is degrading fast. Consider boxing soon.` });
      } else if (maxWear > 40) {
        msgs.push({ urgency: "medium", text: `${worst[0]} at ${worst[1]}% wear — manage the load. Avoid aggressive kerb riding.` });
      } else {
        msgs.push({ urgency: "low", text: `Tyres showing wear (${worst[0]}: ${worst[1]}%). Smooth inputs.` });
      }
      if ((w.FL || 0) - (w.FR || 0) > 15 || (w.FR || 0) - (w.FL || 0) > 15) {
        msgs.push({ urgency: "medium", text: "Significant front tyre imbalance. Adjust your line to balance load." });
      }
      return msgs;
    }
  },
  ersDrs: {
    label: "ERS / DRS", icon: "⚡",
    triggers: (ctx) => ctx.ersStoreMJ != null,
    advice: (ctx) => {
      const msgs = [];
      if (ctx.ersStoreMJ < 0.5) msgs.push({ urgency: "high", text: "ERS depleted — harvesting mode. Avoid aggressive deployment." });
      else if (ctx.ersStoreMJ < 1.5) msgs.push({ urgency: "medium", text: `ERS low (${ctx.ersStoreMJ} MJ). Save for defensive/attack situations.` });
      else if (ctx.ersStoreMJ > 3.5) msgs.push({ urgency: "low", text: `Strong ERS reserve (${ctx.ersStoreMJ} MJ). Deploy freely.` });
      if (ctx.drsActive) msgs.push({ urgency: "low", text: "DRS open — maximize straight-line speed." });
      if (ctx.drsAllowed && !ctx.drsActive) msgs.push({ urgency: "medium", text: "DRS detection zone — close up for activation." });
      return msgs;
    }
  },
  pitStrategy: {
    label: "Pit Strategy", icon: "🔧",
    triggers: (ctx) => {
      const w = ctx.tyreWearPct || {};
      const maxWear = Math.max(w.FL || 0, w.FR || 0, w.RL || 0, w.RR || 0);
      return maxWear > 50 || (ctx.fuelLapsLeft != null && ctx.fuelLapsLeft < 3);
    },
    advice: (ctx) => {
      const msgs = [];
      const w = ctx.tyreWearPct || {};
      const maxWear = Math.max(w.FL || 0, w.FR || 0, w.RL || 0, w.RR || 0);
      const lapsLeft = ctx.totalLaps - ctx.currentLap;
      if (maxWear > 60 && lapsLeft > 10) {
        msgs.push({ urgency: "high", text: `Pit window open. ${lapsLeft} laps remaining. Consider fresh rubber.` });
        if (ctx.tyreCompound === "Soft") msgs.push({ urgency: "medium", text: "Switch to mediums for the run home." });
        if (ctx.tyreCompound === "Medium") msgs.push({ urgency: "medium", text: "Hards could reach the end. Mediums for pace." });
      }
      if (ctx.fuelLapsLeft != null && ctx.fuelLapsLeft < 3) {
        msgs.push({ urgency: "critical", text: `Fuel critical — ${ctx.fuelLapsLeft.toFixed(1)} laps of fuel remaining. Lift and coast.` });
      }
      if (ctx.pitStops === 0 && lapsLeft < 20 && maxWear > 45) {
        msgs.push({ urgency: "medium", text: "No stops yet. Undercut window may be closing." });
      }
      return msgs;
    }
  },
  weather: {
    label: "Weather", icon: "🌧️",
    triggers: (ctx) => ctx.weather && ctx.weather !== "Clear" && ctx.weather !== "Light Cloud",
    advice: (ctx) => {
      const msgs = [];
      if (ctx.weather === "Overcast") {
        msgs.push({ urgency: "low", text: "Overcast conditions. Rain possible — stay alert for a strategy call." });
      }
      if (ctx.weather === "Light Rain") {
        msgs.push({ urgency: "high", text: "Light rain — track is greasy. Consider intermediate tyres." });
        if (ctx.tyreCompound === "Soft" || ctx.tyreCompound === "Medium" || ctx.tyreCompound === "Hard") {
          msgs.push({ urgency: "critical", text: "You're on slicks in the rain. Box for inters or manage grip carefully." });
        }
      }
      if (ctx.weather === "Heavy Rain") {
        msgs.push({ urgency: "critical", text: "Heavy rain — full wets required. Aquaplaning risk is very high." });
      }
      if (ctx.weather === "Storm") {
        msgs.push({ urgency: "critical", text: "Storm conditions — expect red flag possibility. Full wets mandatory." });
      }
      return msgs;
    }
  },
  damage: {
    label: "Damage / Incidents", icon: "💥",
    triggers: (ctx) => {
      if (!ctx.frontWingDmg && !ctx.rearWingDmg && !ctx.floorDmg) return false;
      return (ctx.frontWingDmg?.L > 10 || ctx.frontWingDmg?.R > 10 || ctx.rearWingDmg > 10 || ctx.floorDmg > 10);
    },
    advice: (ctx) => {
      const msgs = [];
      const fwl = ctx.frontWingDmg?.L || 0;
      const fwr = ctx.frontWingDmg?.R || 0;
      const rw = ctx.rearWingDmg || 0;
      const fl = ctx.floorDmg || 0;
      if (fwl > 40 || fwr > 40) msgs.push({ urgency: "critical", text: `Front wing damage ${Math.max(fwl, fwr)}% — box for a new nose, losing significant downforce.` });
      else if (fwl > 15 || fwr > 15) msgs.push({ urgency: "high", text: `Front wing damage (L:${fwl}% R:${fwr}%). Braking affected — extend braking zones.` });
      if (rw > 30) msgs.push({ urgency: "critical", text: `Rear wing damage ${rw}% — significant instability under braking and high speed.` });
      else if (rw > 10) msgs.push({ urgency: "medium", text: `Rear wing damage ${rw}%. Rear stability compromised at speed.` });
      if (fl > 20) msgs.push({ urgency: "high", text: `Floor damage ${fl}%. Downforce loss in corners — adjust entry speed.` });
      return msgs;
    }
  },
  flags: {
    label: "Flags / SC / VSC", icon: "🚩",
    triggers: (ctx) => ctx.safetyCarStatus && ctx.safetyCarStatus > 0,
    advice: (ctx) => {
      const msgs = [];
      if (ctx.safetyCarStatus === 1) {
        msgs.push({ urgency: "critical", text: "Safety Car deployed. Bunch up, manage temps, consider boxing." });
        msgs.push({ urgency: "high", text: "Free pit stop window. Check tyre wear — if >40% this is a no-brainer." });
      }
      if (ctx.safetyCarStatus === 2) {
        msgs.push({ urgency: "high", text: "VSC active. Maintain delta. Use this to cool brakes and harvest ERS." });
        if (ctx.tyreWearPct) {
          const maxWear = Math.max(...Object.values(ctx.tyreWearPct));
          if (maxWear > 50) msgs.push({ urgency: "medium", text: "VSC pit opportunity — tyre wear is high enough to justify the stop." });
        }
      }
      return msgs;
    }
  },
  restart: {
    label: "Restarts", icon: "🔄",
    triggers: (ctx) => ctx.safetyCarStatus === 0 && ctx._prevSafetyCar > 0,
    advice: (ctx) => {
      const msgs = [];
      msgs.push({ urgency: "critical", text: "Green flag — restart! Get your tyres up to temp. Aggressive on lap 1 of green." });
      msgs.push({ urgency: "high", text: "Cars around you will be on cold tyres too. Exploit the first braking zone." });
      return msgs;
    }
  }
};

// ─── SIMULATED TELEMETRY ──────────────────────────────────────────────────
function generateSimData(lap, track) {
  const lapsLeft = (TRACK_MAPS[track]?.laps || 57) - lap;
  const wearBase = Math.min(90, Math.floor(lap * 1.3) + Math.floor(Math.random() * 8));
  const gapAhead = Math.random() < 0.4 ? Math.floor(300 + Math.random() * 900) : Math.floor(1200 + Math.random() * 5000);
  const gapBehind = Math.random() < 0.35 ? Math.floor(200 + Math.random() * 800) : Math.floor(1000 + Math.random() * 4000);
  const prevSC = Math.random() < 0.03 ? 1 : 0;

  return {
    session: "Race",
    track: TRACK_MAPS[track]?.name || track,
    trackKey: track,
    weather: ["Clear", "Light Cloud", "Overcast", "Light Rain"][Math.floor(Math.random() * (lap > 30 ? 4 : 2))],
    totalLaps: TRACK_MAPS[track]?.laps || 57,
    currentLap: lap,
    myPosition: Math.max(1, Math.floor(Math.random() * 10) + 1),
    speedKph: Math.floor(180 + Math.random() * 160),
    gear: Math.max(2, Math.min(8, Math.floor(3 + Math.random() * 6))),
    throttlePct: Math.floor(40 + Math.random() * 60),
    brakePct: Math.floor(Math.random() * 40),
    engineRPM: Math.floor(8000 + Math.random() * 4000),
    drsActive: Math.random() > 0.7,
    drsAllowed: Math.random() > 0.4,
    tyreCompound: ["Soft", "Medium", "Hard"][Math.min(2, Math.floor(lap / 20))],
    tyreAgeLaps: lap % 25,
    tyreWearPct: {
      FL: Math.min(95, wearBase + Math.floor(Math.random() * 10)),
      FR: Math.min(95, wearBase + Math.floor(Math.random() * 8)),
      RL: Math.min(95, wearBase - 5 + Math.floor(Math.random() * 10)),
      RR: Math.min(95, wearBase - 3 + Math.floor(Math.random() * 8))
    },
    tyreSurfaceTemp: {
      FL: 85 + Math.floor(Math.random() * 30),
      FR: 85 + Math.floor(Math.random() * 30),
      RL: 80 + Math.floor(Math.random() * 25),
      RR: 80 + Math.floor(Math.random() * 25)
    },
    fuelKg: Math.max(2, 110 - lap * 1.8 + Math.random() * 3).toFixed(2),
    fuelLapsLeft: Math.max(0.5, lapsLeft + 1 + Math.random() * 2).toFixed(1),
    ersStoreMJ: (Math.random() * 4).toFixed(2),
    ersMode: ["None", "Medium", "Overtake", "Hotlap"][Math.floor(Math.random() * 3)],
    gapToCarAheadMs: gapAhead,
    gapToLeaderMs: Math.floor(gapAhead + Math.random() * 15000),
    frontWingDmg: { L: Math.floor(Math.random() * (lap > 30 ? 35 : 10)), R: Math.floor(Math.random() * (lap > 30 ? 30 : 8)) },
    rearWingDmg: Math.floor(Math.random() * (lap > 40 ? 25 : 5)),
    floorDmg: Math.floor(Math.random() * (lap > 35 ? 20 : 5)),
    pitStops: Math.floor(lap / 25),
    safetyCarStatus: Math.random() < 0.05 ? (Math.random() > 0.5 ? 1 : 2) : 0,
    _prevSafetyCar: prevSC,
    carAhead: {
      name: ["VER", "HAM", "LEC", "NOR", "PIA", "SAI", "RUS", "ALO"][Math.floor(Math.random() * 8)],
      position: Math.max(1, Math.floor(Math.random() * 9)),
      tyreCompound: ["Soft", "Medium", "Hard"][Math.floor(Math.random() * 3)],
      tyreAgeLaps: Math.floor(Math.random() * 30),
      ersStoreMJ: (Math.random() * 4).toFixed(2),
      pitStops: Math.floor(Math.random() * 2),
      gapToThemMs: gapAhead,
    },
    carBehind: {
      name: ["PER", "STR", "OCO", "GAS", "TSU", "MAG", "HUL", "BOT"][Math.floor(Math.random() * 8)],
      position: Math.max(2, Math.floor(Math.random() * 12)),
      tyreCompound: ["Soft", "Medium", "Hard"][Math.floor(Math.random() * 3)],
      tyreAgeLaps: Math.floor(Math.random() * 30),
      ersStoreMJ: (Math.random() * 4).toFixed(2),
      pitStops: Math.floor(Math.random() * 2),
      gapToThemMs: gapBehind,
    },
    engineWearPct: { ICE: Math.floor(Math.random() * 40), MGUH: Math.floor(Math.random() * 30), MGUK: Math.floor(Math.random() * 30), ES: Math.floor(Math.random() * 25), TC: Math.floor(Math.random() * 25) },
    brakesTemp: { FL: 350 + Math.floor(Math.random() * 500), FR: 350 + Math.floor(Math.random() * 500), RL: 300 + Math.floor(Math.random() * 400), RR: 300 + Math.floor(Math.random() * 400) },
    lastLapMs: 78000 + Math.floor(Math.random() * 12000),
    sector: Math.floor(Math.random() * 3),
  };
}

function getActiveAdvice(ctx) {
  const allMsgs = [];
  for (const [key, bucket] of Object.entries(RACE_BUCKETS)) {
    if (bucket.triggers(ctx)) {
      const msgs = bucket.advice(ctx);
      msgs.forEach(m => allMsgs.push({ ...m, category: key, label: bucket.label, icon: bucket.icon }));
    }
  }
  allMsgs.sort((a, b) => {
    const p = { critical: 0, high: 1, medium: 2, low: 3 };
    return (p[a.urgency] ?? 4) - (p[b.urgency] ?? 4);
  });
  return allMsgs;
}

// ─── COMPONENTS ────────────────────────────────────────────────────────────

function TrackMapPanel({ trackKey, ctx }) {
  const track = TRACK_MAPS[trackKey];
  if (!track) return <div style={{ padding: 16, color: "#666" }}>Select a track</div>;

  const carProgress = ctx ? ((ctx.currentLap || 1) / (ctx.totalLaps || 57)) : 0.3;
  const pathLen = 600;
  const carOffset = carProgress * pathLen;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e0e0e0" }}>{track.name}</div>
          <div style={{ fontSize: 11, color: "#888" }}>{track.country} · {track.length} · {track.laps} laps</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#00d2be", letterSpacing: 1 }}>DRS ZONES: {track.drsZones}</div>
        </div>
      </div>
      <svg viewBox="0 0 260 230" style={{ width: "100%", height: "auto", maxHeight: 200 }}>
        <defs>
          <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <path d={track.path} fill="none" stroke="#333" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        <path d={track.path} fill="none" stroke="#555" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 6" />
        {track.corners.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={8} fill={track.overtakeCorners.includes(c.n) ? "rgba(220,0,0,0.3)" : "rgba(100,100,100,0.2)"} />
            <text x={c.x} y={c.y + 3.5} textAnchor="middle" fill={track.overtakeCorners.includes(c.n) ? "#ff4444" : "#888"} fontSize="8" fontWeight="700">{c.n}</text>
          </g>
        ))}
        {track.startFinish && (
          <g>
            <line x1={track.startFinish.x - 8} y1={track.startFinish.y - 12} x2={track.startFinish.x + 8} y2={track.startFinish.y - 12} stroke="#fff" strokeWidth="2" />
            <text x={track.startFinish.x} y={track.startFinish.y - 16} textAnchor="middle" fill="#aaa" fontSize="7">S/F</text>
          </g>
        )}
        <circle cx={track.corners[Math.floor(carProgress * track.corners.length) % track.corners.length]?.x || 100}
                cy={track.corners[Math.floor(carProgress * track.corners.length) % track.corners.length]?.y || 100}
                r="5" fill="#00d2be" filter="url(#glow)" />
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 10, color: "#777" }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "rgba(220,0,0,0.5)", marginRight: 4 }}></span>Overtake zones</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#00d2be", marginRight: 4 }}></span>Your car</span>
      </div>
    </div>
  );
}

function TyreVisual({ wear, temps, compound }) {
  const compoundColors = { Soft: "#ff3333", Medium: "#ffd700", Hard: "#cccccc", Intermediate: "#39b54a", Wet: "#4477ff" };
  const cColor = compoundColors[compound] || "#888";

  const wearColor = (w) => {
    if (w > 70) return "#ff3333";
    if (w > 50) return "#ff8800";
    if (w > 30) return "#ffd700";
    return "#39b54a";
  };

  const positions = [
    { key: "FL", label: "FL", x: 30, y: 20 },
    { key: "FR", label: "FR", x: 150, y: 20 },
    { key: "RL", label: "RL", x: 30, y: 90 },
    { key: "RR", label: "RR", x: 150, y: 90 }
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 18, height: 18, borderRadius: "50%", background: cColor, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#000" }}>
          {compound?.[0] || "?"}
        </span>
        <span style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>{compound || "Unknown"}</span>
      </div>
      <svg viewBox="0 0 220 160" style={{ width: "100%", height: "auto", maxHeight: 130 }}>
        <rect x="70" y="35" width="80" height="90" rx="15" ry="15" fill="none" stroke="#333" strokeWidth="1.5" />
        <line x1="70" y1="80" x2="150" y2="80" stroke="#333" strokeWidth="0.5" />
        {positions.map(p => {
          const w = wear?.[p.key] || 0;
          const t = temps?.[p.key] || 0;
          return (
            <g key={p.key}>
              <rect x={p.x} y={p.y} width="40" height="50" rx="6" ry="6" fill={`${wearColor(w)}22`} stroke={wearColor(w)} strokeWidth="1.5" />
              <text x={p.x + 20} y={p.y + 18} textAnchor="middle" fill={wearColor(w)} fontSize="13" fontWeight="700">{w}%</text>
              <text x={p.x + 20} y={p.y + 32} textAnchor="middle" fill="#888" fontSize="8">{t}°C</text>
              <text x={p.x + 20} y={p.y + 44} textAnchor="middle" fill="#666" fontSize="8" fontWeight="600">{p.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function AdviceCard({ msg }) {
  const urgColors = { critical: "#ff2222", high: "#ff8800", medium: "#ffd700", low: "#00d2be" };
  const urgBg = { critical: "rgba(255,34,34,0.08)", high: "rgba(255,136,0,0.06)", medium: "rgba(255,215,0,0.05)", low: "rgba(0,210,190,0.04)" };

  return (
    <div style={{
      background: urgBg[msg.urgency] || "rgba(30,30,40,0.5)",
      border: `1px solid ${urgColors[msg.urgency] || "#333"}33`,
      borderLeft: `3px solid ${urgColors[msg.urgency] || "#333"}`,
      borderRadius: 6, padding: "8px 12px", marginBottom: 6
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 12 }}>{msg.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: urgColors[msg.urgency], textTransform: "uppercase", letterSpacing: 1 }}>{msg.urgency}</span>
        <span style={{ fontSize: 10, color: "#777", marginLeft: "auto" }}>{msg.label}</span>
      </div>
      <div style={{ fontSize: 12, color: "#d0d0d0", lineHeight: 1.5 }}>{msg.text}</div>
    </div>
  );
}

function GaugeBar({ label, value, max, unit, color, warningAt }) {
  const pct = Math.min(100, (value / max) * 100);
  const isWarning = warningAt && value > warningAt;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: isWarning ? "#ff4444" : "#ccc", fontWeight: 600, fontFamily: "monospace" }}>{typeof value === "number" ? value.toFixed?.(1) ?? value : value}{unit}</span>
      </div>
      <div style={{ height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: isWarning ? "#ff4444" : color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────
export default function RaceEngineerDashboard() {
  const [selectedTrack, setSelectedTrack] = useState("Bahrain");
  const [currentLap, setCurrentLap] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [simData, setSimData] = useState(null);
  const [radioHistory, setRadioHistory] = useState([]);
  const [activePanel, setActivePanel] = useState("dashboard");
  const intervalRef = useRef(null);

  const startSim = useCallback(() => {
    setIsRunning(true);
    setCurrentLap(1);
    setRadioHistory([]);
  }, []);

  const stopSim = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (isRunning) {
      const maxLaps = TRACK_MAPS[selectedTrack]?.laps || 57;
      intervalRef.current = setInterval(() => {
        setCurrentLap(prev => {
          if (prev >= maxLaps) { setIsRunning(false); return prev; }
          return prev + 1;
        });
      }, 2500);
      return () => clearInterval(intervalRef.current);
    }
  }, [isRunning, selectedTrack]);

  useEffect(() => {
    const data = generateSimData(currentLap, selectedTrack);
    setSimData(data);
    const advice = getActiveAdvice(data);
    if (advice.length > 0) {
      const top = advice.slice(0, 2);
      setRadioHistory(prev => [
        ...top.map(a => ({ ...a, lap: currentLap, time: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })),
        ...prev
      ].slice(0, 50));
    }
  }, [currentLap, selectedTrack]);

  const advice = useMemo(() => simData ? getActiveAdvice(simData) : [], [simData]);
  const trackList = Object.keys(TRACK_MAPS);

  const panelStyle = {
    background: "rgba(12,12,20,0.85)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8,
    padding: 14,
    backdropFilter: "blur(10px)"
  };

  const headerStyle = {
    fontSize: 11, fontWeight: 700, color: "#00d2be", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid rgba(0,210,190,0.15)"
  };

  return (
    <div style={{ minHeight: "100vh", background: "#050509", fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", color: "#e0e0e0", overflow: "hidden" }}>
      {/* ─── GLOBAL STYLES ─── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        .nav-btn { background: none; border: none; color: #666; cursor: pointer; padding: 8px 14px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; transition: all 0.2s; border-bottom: 2px solid transparent; font-family: inherit; }
        .nav-btn:hover { color: #aaa; }
        .nav-btn.active { color: #00d2be; border-bottom-color: #00d2be; }
        .track-select { background: #0e0e18; border: 1px solid #2a2a3a; color: #ccc; padding: 6px 10px; border-radius: 4px; font-size: 11px; font-family: inherit; cursor: pointer; }
        .track-select:focus { outline: 1px solid #00d2be; border-color: #00d2be; }
        .track-select option { background: #0e0e18; color: #ccc; }
        .sim-btn { padding: 6px 16px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; text-transform: uppercase; letter-spacing: 1px; transition: all 0.15s; }
        .sim-btn.start { background: #00d2be; color: #000; border: none; }
        .sim-btn.start:hover { background: #00f0d8; }
        .sim-btn.stop { background: transparent; color: #ff4444; border: 1px solid #ff4444; }
        .sim-btn.stop:hover { background: rgba(255,68,68,0.1); }
        .radio-msg { animation: slideIn 0.3s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* ─── TOP BAR ─── */}
      <div style={{ background: "rgba(10,10,16,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px", display: "flex", alignItems: "center", height: 48, gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "Orbitron", fontSize: 14, fontWeight: 800, color: "#00d2be", letterSpacing: 2 }}>◈</span>
          <span style={{ fontFamily: "Orbitron", fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: 3 }}>RACE ENGINEER</span>
        </div>

        <div style={{ display: "flex", gap: 0, marginLeft: 24, borderBottom: "none" }}>
          {[
            { key: "dashboard", label: "Dashboard", icon: "⊞" },
            { key: "track", label: "Track Map", icon: "◎" },
            { key: "radio", label: "Radio Feed", icon: "📻" },
            { key: "strategy", label: "Strategy", icon: "⚙" },
            { key: "rivals", label: "Rivals", icon: "⚔" },
          ].map(tab => (
            <button key={tab.key} className={`nav-btn ${activePanel === tab.key ? 'active' : ''}`} onClick={() => setActivePanel(tab.key)}>
              <span style={{ marginRight: 4 }}>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <select className="track-select" value={selectedTrack} onChange={e => { setSelectedTrack(e.target.value); setCurrentLap(1); setRadioHistory([]); }}>
            {trackList.map(t => <option key={t} value={t}>{TRACK_MAPS[t].name}</option>)}
          </select>
          {isRunning ? (
            <button className="sim-btn stop" onClick={stopSim}>■ Stop</button>
          ) : (
            <button className="sim-btn start" onClick={startSim}>▶ Simulate Race</button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: isRunning ? "#00d2be" : "#ff4444", animation: isRunning ? "pulse 1.5s infinite" : "none" }} />
            <span style={{ fontSize: 10, color: isRunning ? "#00d2be" : "#666" }}>{isRunning ? "LIVE" : "OFFLINE"}</span>
          </div>
        </div>
      </div>

      {/* ─── QUICK STATUS STRIP ─── */}
      {simData && (
        <div style={{ background: "rgba(10,10,20,0.8)", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "6px 20px", display: "flex", gap: 24, fontSize: 11 }}>
          {[
            { l: "POS", v: `P${simData.myPosition}`, c: "#fff" },
            { l: "LAP", v: `${simData.currentLap}/${simData.totalLaps}`, c: "#ccc" },
            { l: "SPEED", v: `${simData.speedKph} km/h`, c: "#00d2be" },
            { l: "GEAR", v: simData.gear, c: "#ff8800" },
            { l: "GAP AHEAD", v: `${(simData.gapToCarAheadMs / 1000).toFixed(2)}s`, c: simData.gapToCarAheadMs < 1200 ? "#ff4444" : "#888" },
            { l: "TYRE", v: simData.tyreCompound, c: simData.tyreCompound === "Soft" ? "#ff3333" : simData.tyreCompound === "Medium" ? "#ffd700" : "#ccc" },
            { l: "ERS", v: `${simData.ersStoreMJ} MJ`, c: parseFloat(simData.ersStoreMJ) < 1 ? "#ff4444" : "#6666ff" },
            { l: "FUEL", v: `${simData.fuelLapsLeft} laps`, c: parseFloat(simData.fuelLapsLeft) < 3 ? "#ff4444" : "#39b54a" },
            { l: "WEATHER", v: simData.weather, c: simData.weather.includes("Rain") ? "#4477ff" : "#888" },
            { l: "SC", v: simData.safetyCarStatus === 1 ? "SC" : simData.safetyCarStatus === 2 ? "VSC" : "─", c: simData.safetyCarStatus > 0 ? "#ffd700" : "#555" },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#555", fontWeight: 600, letterSpacing: 0.5 }}>{s.l}</span>
              <span style={{ color: s.c, fontWeight: 700, fontFamily: "monospace" }}>{s.v}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── MAIN CONTENT AREA ─── */}
      <div style={{ padding: 16, height: "calc(100vh - 96px)", overflowY: "auto" }}>

        {/* ═══ DASHBOARD ═══ */}
        {activePanel === "dashboard" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 300px", gap: 12, height: "100%" }}>
            {/* Left Column — Telemetry */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={panelStyle}>
                <div style={headerStyle}>Speed & Inputs</div>
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 12 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "Orbitron", fontSize: 42, fontWeight: 800, color: "#fff" }}>{simData?.speedKph || 0}</div>
                    <div style={{ fontSize: 10, color: "#666" }}>KM/H</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "0 16px", borderLeft: "1px solid #222", borderRight: "1px solid #222" }}>
                    <div style={{ fontFamily: "Orbitron", fontSize: 36, fontWeight: 800, color: "#ff8800" }}>{simData?.gear || "N"}</div>
                    <div style={{ fontSize: 10, color: "#666" }}>GEAR</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <GaugeBar label="RPM" value={simData?.engineRPM || 0} max={15000} unit="" color="#00d2be" />
                    <GaugeBar label="Throttle" value={simData?.throttlePct || 0} max={100} unit="%" color="#39b54a" />
                    <GaugeBar label="Brake" value={simData?.brakePct || 0} max={100} unit="%" color="#ff3333" />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
                  <span style={{ padding: "3px 8px", borderRadius: 3, background: simData?.drsActive ? "rgba(0,210,190,0.2)" : "#111", color: simData?.drsActive ? "#00d2be" : "#555", fontWeight: 700 }}>DRS {simData?.drsActive ? "OPEN" : "OFF"}</span>
                  <span style={{ padding: "3px 8px", borderRadius: 3, background: "rgba(100,100,255,0.1)", color: "#88f", fontWeight: 600 }}>ERS: {simData?.ersMode || "─"}</span>
                </div>
              </div>

              <div style={panelStyle}>
                <div style={headerStyle}>Tyres & Wear</div>
                <TyreVisual wear={simData?.tyreWearPct} temps={simData?.tyreSurfaceTemp} compound={simData?.tyreCompound} />
                <div style={{ fontSize: 10, color: "#666", marginTop: 6 }}>Age: {simData?.tyreAgeLaps || 0} laps</div>
              </div>

              <div style={{ ...panelStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ ...headerStyle, fontSize: 10 }}>Fuel</div>
                  <GaugeBar label="In tank" value={parseFloat(simData?.fuelKg || 0)} max={110} unit=" kg" color="#4488ff" />
                  <GaugeBar label="Laps left" value={parseFloat(simData?.fuelLapsLeft || 0)} max={60} unit="" color="#4488ff" warningAt={5} />
                </div>
                <div>
                  <div style={{ ...headerStyle, fontSize: 10 }}>ERS</div>
                  <GaugeBar label="Store" value={parseFloat(simData?.ersStoreMJ || 0)} max={4} unit=" MJ" color="#8844ff" />
                  <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Mode: <span style={{ color: "#ccc", fontWeight: 600 }}>{simData?.ersMode || "─"}</span></div>
                </div>
              </div>
            </div>

            {/* Center Column — Track Map + Advice */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={panelStyle}>
                <div style={headerStyle}>Circuit Map</div>
                <TrackMapPanel trackKey={selectedTrack} ctx={simData} />
              </div>

              <div style={{ ...panelStyle, flex: 1, overflowY: "auto", maxHeight: 360 }}>
                <div style={headerStyle}>Engineer Advice ({advice.length})</div>
                {advice.length === 0 ? (
                  <div style={{ color: "#555", fontSize: 11, textAlign: "center", padding: 20 }}>No active situations detected</div>
                ) : (
                  advice.slice(0, 8).map((msg, i) => <AdviceCard key={i} msg={msg} />)
                )}
              </div>
            </div>

            {/* Right Column — Proximity + Damage */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={panelStyle}>
                <div style={headerStyle}>Proximity</div>
                {simData?.carAhead && (
                  <div style={{ padding: "8px 10px", background: simData.gapToCarAheadMs < 1200 ? "rgba(255,68,68,0.08)" : "rgba(30,30,40,0.5)", borderRadius: 6, marginBottom: 8, border: `1px solid ${simData.gapToCarAheadMs < 1200 ? "rgba(255,68,68,0.2)" : "#222"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 2 }}>
                      <span>AHEAD</span>
                      <span style={{ color: simData.gapToCarAheadMs < 1200 ? "#ff4444" : "#666", fontWeight: 700 }}>+{(simData.gapToCarAheadMs / 1000).toFixed(2)}s</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0" }}>{simData.carAhead.name} · P{simData.carAhead.position}</div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{simData.carAhead.tyreCompound} · {simData.carAhead.tyreAgeLaps}L · ERS {simData.carAhead.ersStoreMJ}MJ</div>
                  </div>
                )}
                <div style={{ textAlign: "center", padding: "6px 0", fontSize: 12, fontWeight: 800, color: "#00d2be", letterSpacing: 2 }}>— YOU (P{simData?.myPosition}) —</div>
                {simData?.carBehind && (
                  <div style={{ padding: "8px 10px", background: (simData.carBehind.gapToThemMs || 9999) < 1000 ? "rgba(255,136,0,0.08)" : "rgba(30,30,40,0.5)", borderRadius: 6, marginTop: 8, border: `1px solid ${(simData.carBehind.gapToThemMs || 9999) < 1000 ? "rgba(255,136,0,0.2)" : "#222"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 2 }}>
                      <span>BEHIND</span>
                      <span style={{ color: (simData.carBehind.gapToThemMs || 9999) < 1000 ? "#ff8800" : "#666", fontWeight: 700 }}>-{((simData.carBehind.gapToThemMs || 0) / 1000).toFixed(2)}s</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0" }}>{simData.carBehind.name} · P{simData.carBehind.position}</div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{simData.carBehind.tyreCompound} · {simData.carBehind.tyreAgeLaps}L · ERS {simData.carBehind.ersStoreMJ}MJ</div>
                  </div>
                )}
              </div>

              <div style={panelStyle}>
                <div style={headerStyle}>Damage Report</div>
                <GaugeBar label="Front Wing L" value={simData?.frontWingDmg?.L || 0} max={100} unit="%" color="#ff8800" warningAt={30} />
                <GaugeBar label="Front Wing R" value={simData?.frontWingDmg?.R || 0} max={100} unit="%" color="#ff8800" warningAt={30} />
                <GaugeBar label="Rear Wing" value={simData?.rearWingDmg || 0} max={100} unit="%" color="#ff4444" warningAt={20} />
                <GaugeBar label="Floor" value={simData?.floorDmg || 0} max={100} unit="%" color="#ffd700" warningAt={15} />
              </div>

              <div style={panelStyle}>
                <div style={headerStyle}>Engine Wear</div>
                {simData?.engineWearPct && Object.entries(simData.engineWearPct).map(([k, v]) => (
                  <GaugeBar key={k} label={k} value={v} max={100} unit="%" color="#8844ff" warningAt={60} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ TRACK MAP PAGE ═══ */}
        {activePanel === "track" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 1200 }}>
            {trackList.map(tk => (
              <div key={tk} style={{ ...panelStyle, cursor: "pointer", transition: "border-color 0.2s", borderColor: tk === selectedTrack ? "rgba(0,210,190,0.3)" : undefined }}
                   onClick={() => setSelectedTrack(tk)}>
                <TrackMapPanel trackKey={tk} ctx={tk === selectedTrack ? simData : null} />
              </div>
            ))}
          </div>
        )}

        {/* ═══ RADIO FEED PAGE ═══ */}
        {activePanel === "radio" && (
          <div style={{ maxWidth: 700 }}>
            <div style={{ ...panelStyle, marginBottom: 12 }}>
              <div style={headerStyle}>Live Radio Feed — Rule-Based Engineer</div>
              <div style={{ fontSize: 11, color: "#777", marginBottom: 12 }}>
                Situational advice based on 10 race buckets: Start, Overtaking, Defending, Tyre Wear, ERS/DRS, Pit Strategy, Weather, Damage, Flags/SC/VSC, Restarts. No AI API calls — pure telemetry logic.
              </div>
              {radioHistory.length === 0 ? (
                <div style={{ color: "#555", textAlign: "center", padding: 30 }}>Start the simulation to see radio messages</div>
              ) : (
                radioHistory.map((msg, i) => (
                  <div key={i} className="radio-msg" style={{ ...{}, background: "rgba(15,15,25,0.6)", border: "1px solid #1a1a2e", borderRadius: 6, padding: "8px 12px", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 11 }}>{msg.icon}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: { critical: "#ff2222", high: "#ff8800", medium: "#ffd700", low: "#00d2be" }[msg.urgency], textTransform: "uppercase", letterSpacing: 1 }}>{msg.urgency}</span>
                      <span style={{ fontSize: 9, color: "#555" }}>LAP {msg.lap}</span>
                      <span style={{ fontSize: 9, color: "#444", marginLeft: "auto" }}>{msg.time}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#c0c0c0" }}>{msg.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ═══ STRATEGY PAGE ═══ */}
        {activePanel === "strategy" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 1100 }}>
            <div style={panelStyle}>
              <div style={headerStyle}>Pit Strategy Window</div>
              {simData && (() => {
                const lapsLeft = simData.totalLaps - simData.currentLap;
                const w = simData.tyreWearPct || {};
                const maxWear = Math.max(w.FL || 0, w.FR || 0, w.RL || 0, w.RR || 0);
                const pitNow = maxWear > 60 && lapsLeft > 8;
                const canFinish = maxWear < 50 && lapsLeft < 15;
                return (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                      <div style={{ background: "#111", borderRadius: 6, padding: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: "#666" }}>LAPS LEFT</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: "Orbitron" }}>{lapsLeft}</div>
                      </div>
                      <div style={{ background: "#111", borderRadius: 6, padding: 10, textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: "#666" }}>PIT STOPS</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#ff8800", fontFamily: "Orbitron" }}>{simData.pitStops}</div>
                      </div>
                    </div>
                    <div style={{ padding: 10, borderRadius: 6, background: pitNow ? "rgba(255,136,0,0.1)" : canFinish ? "rgba(57,181,74,0.1)" : "rgba(255,215,0,0.05)", border: `1px solid ${pitNow ? "#ff880033" : canFinish ? "#39b54a33" : "#ffd70022"}`, marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: pitNow ? "#ff8800" : canFinish ? "#39b54a" : "#ffd700", marginBottom: 4 }}>
                        {pitNow ? "⚠ PIT WINDOW OPEN" : canFinish ? "✓ CAN REACH THE END" : "⏳ MONITORING WEAR"}
                      </div>
                      <div style={{ fontSize: 11, color: "#999" }}>
                        {pitNow ? `Max wear at ${maxWear}% with ${lapsLeft} laps to go. Fresh tyres will gain pace.` : canFinish ? `Wear manageable at ${maxWear}%. Stay out and manage.` : `Wear at ${maxWear}%. Keep monitoring — not urgent yet.`}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#777", marginTop: 8 }}>
                      <strong style={{ color: "#ccc" }}>Compound options:</strong><br />
                      {simData.tyreCompound === "Soft" && "→ Switch to Mediums (balanced) or Hards (go long)"}
                      {simData.tyreCompound === "Medium" && "→ Softs for pace (short stint) or Hards (to the end)"}
                      {simData.tyreCompound === "Hard" && "→ Softs for sprint finish or Mediums for reliability"}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={panelStyle}>
              <div style={headerStyle}>Overtake Analysis</div>
              <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700, color: "#ff4444", marginBottom: 6 }}>5 Reasons Overtakes Happen:</div>
                {["Better corner exit speed", "DRS activation on straight", "Superior ERS deployment", "Tyre grip advantage (fresher rubber)", "Rival mistake (lock-up, wide exit, error)"].map((r, i) => (
                  <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #1a1a2e" }}>
                    <span style={{ color: "#ff6666", fontWeight: 600, marginRight: 6 }}>{i + 1}.</span>{r}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.7, marginTop: 14 }}>
                <div style={{ fontWeight: 700, color: "#00d2be", marginBottom: 6 }}>5 Keys to Successful Defence:</div>
                {["Cover the inside line once", "Brake under control (no lock-ups)", "Good apex placement", "Strong corner exit speed", "Smart ERS usage on exits"].map((r, i) => (
                  <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #1a1a2e" }}>
                    <span style={{ color: "#00d2be", fontWeight: 600, marginRight: 6 }}>{i + 1}.</span>{r}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...panelStyle, gridColumn: "1 / -1" }}>
              <div style={headerStyle}>10 Race Situation Buckets — Active Status</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {Object.entries(RACE_BUCKETS).map(([key, bucket]) => {
                  const isActive = simData ? bucket.triggers(simData) : false;
                  return (
                    <div key={key} style={{ background: isActive ? "rgba(0,210,190,0.08)" : "#0a0a14", border: `1px solid ${isActive ? "rgba(0,210,190,0.3)" : "#1a1a2e"}`, borderRadius: 6, padding: "10px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{bucket.icon}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: isActive ? "#00d2be" : "#555", textTransform: "uppercase", letterSpacing: 0.5 }}>{bucket.label}</div>
                      <div style={{ fontSize: 8, color: isActive ? "#39b54a" : "#333", marginTop: 3, fontWeight: 600 }}>{isActive ? "● ACTIVE" : "○ IDLE"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══ RIVALS PAGE ═══ */}
        {activePanel === "rivals" && simData && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 1000 }}>
            <div style={panelStyle}>
              <div style={headerStyle}>Car Ahead — {simData.carAhead?.name || "N/A"}</div>
              {simData.carAhead && (() => {
                const r = simData.carAhead;
                const gap = (simData.gapToCarAheadMs / 1000).toFixed(2);
                const inDrs = simData.gapToCarAheadMs < 1000;
                return (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <div style={{ background: "#111", borderRadius: 6, padding: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "#666" }}>GAP</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: inDrs ? "#ff4444" : "#ccc", fontFamily: "Orbitron" }}>+{gap}s</div>
                      </div>
                      <div style={{ background: "#111", borderRadius: 6, padding: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "#666" }}>TYRE</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#ccc" }}>{r.tyreCompound}<br /><span style={{ fontSize: 10, color: "#888" }}>{r.tyreAgeLaps}L</span></div>
                      </div>
                      <div style={{ background: "#111", borderRadius: 6, padding: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "#666" }}>ERS</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#88f" }}>{r.ersStoreMJ} MJ</div>
                      </div>
                    </div>
                    {inDrs && <div style={{ padding: 8, background: "rgba(255,68,68,0.08)", borderRadius: 6, border: "1px solid rgba(255,68,68,0.2)", fontSize: 11, color: "#ff6666", fontWeight: 600 }}>⚠ IN DRS RANGE — Attack window open</div>}
                    <div style={{ marginTop: 10, fontSize: 11, color: "#888" }}>
                      <strong style={{ color: "#aaa" }}>Vulnerabilities:</strong>
                      <div style={{ marginTop: 4 }}>
                        {r.tyreAgeLaps > (simData.tyreAgeLaps || 0) + 5 && <div style={{ color: "#39b54a" }}>✓ Older tyres ({r.tyreAgeLaps}L vs your {simData.tyreAgeLaps}L)</div>}
                        {parseFloat(r.ersStoreMJ) < parseFloat(simData.ersStoreMJ) - 0.5 && <div style={{ color: "#39b54a" }}>✓ Less ERS ({r.ersStoreMJ} vs your {simData.ersStoreMJ})</div>}
                        {simData.drsAllowed && <div style={{ color: "#39b54a" }}>✓ DRS available</div>}
                        {r.tyreAgeLaps <= (simData.tyreAgeLaps || 0) && parseFloat(r.ersStoreMJ) >= parseFloat(simData.ersStoreMJ) && !simData.drsAllowed && <div style={{ color: "#666" }}>No clear advantage detected. Build pressure.</div>}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={panelStyle}>
              <div style={headerStyle}>Car Behind — {simData.carBehind?.name || "N/A"}</div>
              {simData.carBehind && (() => {
                const r = simData.carBehind;
                const gap = ((r.gapToThemMs || 0) / 1000).toFixed(2);
                const underThreat = (r.gapToThemMs || 9999) < 1000;
                return (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <div style={{ background: "#111", borderRadius: 6, padding: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "#666" }}>GAP</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: underThreat ? "#ff8800" : "#ccc", fontFamily: "Orbitron" }}>-{gap}s</div>
                      </div>
                      <div style={{ background: "#111", borderRadius: 6, padding: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "#666" }}>TYRE</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#ccc" }}>{r.tyreCompound}<br /><span style={{ fontSize: 10, color: "#888" }}>{r.tyreAgeLaps}L</span></div>
                      </div>
                      <div style={{ background: "#111", borderRadius: 6, padding: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: "#666" }}>ERS</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#88f" }}>{r.ersStoreMJ} MJ</div>
                      </div>
                    </div>
                    {underThreat && <div style={{ padding: 8, background: "rgba(255,136,0,0.08)", borderRadius: 6, border: "1px solid rgba(255,136,0,0.2)", fontSize: 11, color: "#ff8800", fontWeight: 600 }}>🛡 UNDER THREAT — Defend position</div>}
                    <div style={{ marginTop: 10, fontSize: 11, color: "#888" }}>
                      <strong style={{ color: "#aaa" }}>Their advantages:</strong>
                      <div style={{ marginTop: 4 }}>
                        {r.tyreAgeLaps < (simData.tyreAgeLaps || 0) - 5 && <div style={{ color: "#ff6666" }}>⚠ Fresher tyres ({r.tyreAgeLaps}L vs your {simData.tyreAgeLaps}L)</div>}
                        {parseFloat(r.ersStoreMJ) > parseFloat(simData.ersStoreMJ) + 0.5 && <div style={{ color: "#ff6666" }}>⚠ More ERS ({r.ersStoreMJ} vs your {simData.ersStoreMJ})</div>}
                        {r.tyreAgeLaps >= (simData.tyreAgeLaps || 0) && parseFloat(r.ersStoreMJ) <= parseFloat(simData.ersStoreMJ) && <div style={{ color: "#39b54a" }}>No clear threat advantage. Hold position cleanly.</div>}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={{ ...panelStyle, gridColumn: "1 / -1" }}>
              <div style={headerStyle}>Brake Temperatures</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                {simData.brakesTemp && Object.entries(simData.brakesTemp).map(([k, v]) => (
                  <div key={k}>
                    <GaugeBar label={k} value={v} max={1000} unit="°C" color={v > 700 ? "#ff4444" : v > 500 ? "#ffd700" : "#39b54a"} warningAt={700} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}