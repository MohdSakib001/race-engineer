(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const l of document.querySelectorAll('link[rel="modulepreload"]'))r(l);new MutationObserver(l=>{for(const s of l)if(s.type==="childList")for(const o of s.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&r(o)}).observe(document,{childList:!0,subtree:!0});function i(l){const s={};return l.integrity&&(s.integrity=l.integrity),l.referrerPolicy&&(s.referrerPolicy=l.referrerPolicy),l.crossOrigin==="use-credentials"?s.credentials="include":l.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function r(l){if(l.ep)return;l.ep=!0;const s=i(l);fetch(l.href,s)}})();let H={},R={};const d={connected:!1,session:null,participants:null,lapData:null,telemetry:null,status:null,damage:null,allCarStatus:null,playerCarIndex:0},M={enabled:!0,awaiting:!1,lastTrigger:{attack:0,defense:0},COOLDOWN_MS:25e3,prevScenario:null};function K(a){document.querySelectorAll(".nav-item").forEach(t=>{t.classList.toggle("active",t.dataset.page===a)}),document.querySelectorAll(".page").forEach(t=>{t.classList.toggle("active",t.id===`page-${a}`)})}function E(a){if(!a||a===0)return"─:──.───";const t=Math.floor(a/6e4),i=Math.floor(a%6e4/1e3),r=a%1e3;return`${t}:${String(i).padStart(2,"0")}.${String(r).padStart(3,"0")}`}function F(a){if(!a||a===0)return"──.───";const t=Math.floor(a/1e3),i=a%1e3;return`${t}.${String(i).padStart(3,"0")}`}function N(a){if(!a||a<=0)return"0:00";const t=Math.floor(a/60),i=a%60;return`${t}:${String(i).padStart(2,"0")}`}function $(a,t,i){return Math.min(i,Math.max(t,a))}function P(a){return a<50?"temp-cold":a<70?"temp-cool":a<90?"temp-opt":a<110?"temp-warm":a<130?"temp-hot":"temp-vhot"}function U(a){return a<25?"dmg-low":a<50?"dmg-mid":a<75?"dmg-high":"dmg-crit"}function j(a){const t=R[a]||{label:"?",color:"#888"};return`<span class="tyre-badge" style="background:${t.color}22;color:${t.color};border:1px solid ${t.color}55">${t.label}</span>`}function _(a){return H[a]||"#888888"}function J(a){return{0:"☀️",1:"⛅",2:"☁️",3:"🌧️",4:"⛈️",5:"⛈️"}[a]||"☀️"}function G(a){return{0:"",1:"SC",2:"VSC",3:"SC Ending"}[a]||""}function e(a){return document.getElementById(a)}function z(){var i;const a=(i=d.lapData)==null?void 0:i[d.playerCarIndex],t=d.session;if(t){const r=t.safetyCarStatus?` · ${G(t.safetyCarStatus)}`:"";e("topbar-session").textContent=`${t.trackName||"─"} · ${t.sessionTypeName||"─"}${r}`}a&&(e("tb-pos").innerHTML=`P<strong>${a.carPosition||"─"}</strong>`,e("tb-lap").innerHTML=`Lap <strong>${a.currentLapNum||"─"}/${(t==null?void 0:t.totalLaps)||"─"}</strong>`,e("tb-time").innerHTML=`<strong>${E(a.currentLapTimeMs)}</strong>`)}function Y(){const a=e("page-dashboard");a.innerHTML=`
    <div class="dash-main">
      <!-- Hero: speed / gear / rpm -->
      <div class="hero-panel">
        <div class="speed-display">
          <div class="speed-value" id="d-speed">0</div>
          <div class="speed-unit">km/h</div>
        </div>
        <div class="gear-display">
          <div class="gear-value" id="d-gear">N</div>
          <div class="gear-label">Gear</div>
        </div>
        <div class="rpm-section">
          <div class="rpm-label">Engine RPM</div>
          <div class="rpm-value" id="d-rpm">0</div>
          <div class="rpm-bar-track">
            <div class="rpm-bar-fill" id="d-rpm-bar" style="width:0%"></div>
          </div>
          <div class="rev-lights" id="d-revlights">
            ${Array.from({length:15},(t,i)=>`<div class="rev-light" id="rl-${i}"></div>`).join("")}
          </div>
        </div>
        <div style="margin-left:auto">
          <div class="drs-badge inactive" id="d-drs">DRS</div>
        </div>
      </div>

      <!-- Pedals -->
      <div class="pedals-panel">
        <div class="section-title">Inputs</div>
        <div class="pedals-row">
          <div class="pedal-block">
            <div class="pedal-label"><span>Throttle</span><span id="d-throttle-val">0%</span></div>
            <div class="pedal-track"><div class="pedal-fill throttle" id="d-throttle" style="width:0%"></div></div>
          </div>
          <div class="pedal-block">
            <div class="pedal-label"><span>Brake</span><span id="d-brake-val">0%</span></div>
            <div class="pedal-track"><div class="pedal-fill brake" id="d-brake" style="width:0%"></div></div>
          </div>
          <div class="pedal-block" style="max-width:100px">
            <div class="pedal-label"><span>Clutch</span><span id="d-clutch-val">0%</span></div>
            <div class="pedal-track"><div class="pedal-fill clutch" id="d-clutch" style="width:0%"></div></div>
          </div>
        </div>
      </div>

      <!-- Fuel & ERS quick -->
      <div class="grid-2">
        <div class="panel">
          <div class="panel-header">Fuel</div>
          <div class="panel-body">
            <div class="stat-row"><span class="stat-label">In tank</span><span class="stat-value" id="d-fuel">─ kg</span></div>
            <div class="stat-row"><span class="stat-label">Laps remaining</span><span class="stat-value" id="d-fuel-laps">─</span></div>
            <div class="prog-bar" style="margin-top:10px"><div class="prog-fill fuel" id="d-fuel-bar" style="width:0%"></div></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">ERS</div>
          <div class="panel-body">
            <div class="stat-row"><span class="stat-label">Store</span><span class="stat-value" id="d-ers">─ MJ</span></div>
            <div class="stat-row"><span class="stat-label">Deploy mode</span><span class="stat-value" id="d-ers-mode">─</span></div>
            <div class="prog-bar" style="margin-top:10px"><div class="prog-fill ers" id="d-ers-bar" style="width:0%"></div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Side: tyres + lap info -->
    <div class="dash-side">
      <div class="panel">
        <div class="panel-header">Tyres <span id="d-tyre-compound" style="font-weight:400;font-size:11px;color:var(--text2)"></span></div>
        <div class="panel-body">
          <div class="tyres-grid" id="d-tyres">
            ${["FL","FR","RL","RR"].map(t=>`
              <div class="tyre-cell">
                <div class="tyre-circle temp-cool" id="tc-${t}">
                  <span class="tyre-temp" id="tt-${t}">─</span>
                  <span class="tyre-unit">°C</span>
                </div>
                <div class="tyre-label">${t}</div>
                <div class="tyre-wear" id="tw-${t}">wear: ─%</div>
              </div>`).join("")}
          </div>
          <div style="margin-top:12px">
            <div class="section-title">Brake Temps</div>
            <div class="grid-2" style="gap:8px">
              ${["FL","FR","RL","RR"].map(t=>`
                <div class="stat-row">
                  <span class="stat-label">${t}</span>
                  <span class="stat-value mono" id="bt-${t}">─°C</span>
                </div>`).join("")}
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">Lap Info</div>
        <div class="panel-body">
          <div class="stat-row"><span class="stat-label">Position</span><span class="stat-value" id="d-pos">─</span></div>
          <div class="stat-row"><span class="stat-label">Current lap</span><span class="stat-value mono" id="d-cur-lap">─</span></div>
          <div class="stat-row"><span class="stat-label">Last lap</span><span class="stat-value mono" id="d-last-lap">─</span></div>
          <div class="stat-row"><span class="stat-label">Sector 1</span><span class="stat-value mono" id="d-s1">─</span></div>
          <div class="stat-row"><span class="stat-label">Sector 2</span><span class="stat-value mono" id="d-s2">─</span></div>
          <div class="stat-row"><span class="stat-label">Pit stops</span><span class="stat-value" id="d-pits">─</span></div>
          <div class="stat-row"><span class="stat-label">Tyre age</span><span class="stat-value" id="d-tyre-age">─ laps</span></div>
        </div>
      </div>
    </div>
  `}function V(){var m;const a=d.telemetry,t=d.status,i=d.damage,r=(m=d.lapData)==null?void 0:m[d.playerCarIndex];if(!a)return;e("d-speed").textContent=a.speed,e("d-gear").textContent=a.gear<=0?a.gear===0?"N":"R":a.gear;const l=(t==null?void 0:t.maxRPM)||15e3,s=$(a.engineRPM/l*100,0,100);e("d-rpm").textContent=a.engineRPM.toLocaleString(),e("d-rpm-bar").style.width=s+"%";const o=Math.round(a.revLightsPercent/100*15);for(let v=0;v<15;v++){const y=e(`rl-${v}`);y&&(v<o?y.className="rev-light "+(v<5?"on-green":v<10?"on-yellow":"on-red"):y.className="rev-light")}const n=e("d-drs");a.drs?(n.className="drs-badge active",n.textContent="DRS ON"):(n.className="drs-badge inactive",n.textContent="DRS");const f=Math.round(a.throttle*100),g=Math.round(a.brake*100),p=$(a.clutch,0,100);e("d-throttle").style.width=f+"%",e("d-throttle-val").textContent=f+"%",e("d-brake").style.width=g+"%",e("d-brake-val").textContent=g+"%",e("d-clutch").style.width=p+"%",e("d-clutch-val").textContent=p+"%";const c={RL:0,RR:1,FL:2,FR:3};for(const[v,y]of Object.entries(c)){const b=a.tyreSurfaceTemp[y],h=e(`tc-${v}`);if(h&&(h.className=`tyre-circle ${P(b)}`,e(`tt-${v}`).textContent=b),i){const u=Math.round(i.tyresWear[y]);e(`tw-${v}`).textContent=`wear: ${u}%`}const C=e(`bt-${v}`);C&&(C.textContent=a.brakesTemp[y]+"°C")}if(t){const v=$(t.fuelInTank/t.fuelCapacity*100,0,100);e("d-fuel").textContent=t.fuelInTank.toFixed(2)+" kg",e("d-fuel-laps").textContent=t.fuelRemainingLaps.toFixed(1),e("d-fuel-bar").style.width=v+"%";const y=$(t.ersStoreEnergy/4e6*100,0,100);e("d-ers").textContent=(t.ersStoreEnergy/1e6).toFixed(2)+" MJ";const b=["None","Medium","Overtake","Hotlap"];e("d-ers-mode").textContent=b[t.ersDeployMode]||"None",e("d-ers-bar").style.width=y+"%";const h=R[t.visualTyreCompound]||{name:"Unknown",color:"#888"};e("d-tyre-compound").innerHTML=`<span style="color:${h.color}">${h.name}</span>`,e("d-tyre-age").textContent=t.tyresAgeLaps+" laps"}r&&(e("d-pos").textContent=`P${r.carPosition}`,e("d-cur-lap").textContent=E(r.currentLapTimeMs),e("d-last-lap").textContent=E(r.lastLapTimeMs),e("d-s1").textContent=F(r.sector1TimeMs),e("d-s2").textContent=F(r.sector2TimeMs),e("d-pits").textContent=r.numPitStops)}function Q(){e("page-timing").innerHTML=`
    <div style="padding:16px 0 0; overflow-x:auto; height:100%">
      <table class="timing-table">
        <thead>
          <tr>
            <th style="width:36px">P</th>
            <th>Driver</th>
            <th class="right">Gap</th>
            <th class="right">Interval</th>
            <th class="right">Last Lap</th>
            <th class="right">Best Lap</th>
            <th class="right">S1</th>
            <th class="right">S2</th>
            <th class="center">Tyre</th>
            <th class="center">Age</th>
            <th class="center">Pits</th>
            <th class="center">Status</th>
          </tr>
        </thead>
        <tbody id="timing-body">
          <tr><td colspan="12"><div class="empty-state"><div class="empty-icon">≡</div><div class="empty-text">Waiting for telemetry…</div></div></td></tr>
        </tbody>
      </table>
    </div>
  `}function X(){const a=d.lapData,t=d.participants;if(!a)return;const i=a.map((s,o)=>({...s,idx:o})).filter(s=>s&&s.resultStatus>=2&&s.carPosition>0).sort((s,o)=>s.carPosition-o.carPosition);if(i.length===0)return;const r=i[0],l=i.map((s,o)=>{var L,x;const n=(L=t==null?void 0:t.participants)==null?void 0:L[s.idx],f=(n==null?void 0:n.teamId)??-1,g=_(f),p=(n==null?void 0:n.name)||`Car ${s.idx+1}`,c=s.idx===d.playerCarIndex,m=(x=d.allCarStatus)==null?void 0:x[s.idx],v=m==null?void 0:m.visualTyreCompound,y=(m==null?void 0:m.tyresAgeLaps)??"─";let b="─";if(o===0)b="Leader";else{const w=s.totalDistance>0?Math.round((r.totalDistance-s.totalDistance)*10):0;b=w>0?`+${(w/10).toFixed(1)}s`:"─"}let h="─";if(o>0){const w=i[o-1],k=w.totalDistance>0?Math.round((w.totalDistance-s.totalDistance)*10):0;h=k>0?`+${(k/10).toFixed(1)}s`:"─"}let C="";s.pitStatus===1?C='<span class="pit-badge in-lane">PIT LANE</span>':s.pitStatus===2?C='<span class="pit-badge in-pit">IN PIT</span>':C=`<span class="pit-badge">${s.numPitStops}</span>`;let u="";return s.resultStatus===3?u='<span class="status-badge dnf">DNF</span>':s.resultStatus===4?u='<span class="status-badge dnf">DSQ</span>':s.resultStatus===5?u='<span class="status-badge out">NC</span>':s.driverStatus===0&&(u='<span class="status-badge out">Pits</span>'),`
      <tr class="${c?"player-row":""}">
        <td class="pos-cell">${s.carPosition}</td>
        <td class="driver-cell">
          <span class="team-bar" style="background:${g}"></span>
          <span class="driver-name">${p}</span>
          ${c?'<span style="font-size:10px;color:var(--accent);margin-left:4px">YOU</span>':""}
        </td>
        <td class="right gap-time">${b}</td>
        <td class="right gap-time">${h}</td>
        <td class="right lap-time ${s.currentLapInvalid?"lap-invalid":""}">${E(s.lastLapTimeMs)}</td>
        <td class="right lap-time">─</td>
        <td class="right sector-time">${F(s.sector1TimeMs)}</td>
        <td class="right sector-time">${F(s.sector2TimeMs)}</td>
        <td class="center">${v?j(v):"─"}</td>
        <td class="center text-dim">${y}</td>
        <td class="center">${C}</td>
        <td class="center">${u}</td>
      </tr>`}).join("");e("timing-body").innerHTML=l}function Z(){e("page-vehicle").innerHTML=`
    <div class="tabs">
      <button class="tab-btn active" data-tab="general">General</button>
      <button class="tab-btn" data-tab="ers">ERS &amp; Fuel</button>
      <button class="tab-btn" data-tab="damage">Damage</button>
      <button class="tab-btn" data-tab="tyres">Tyre Detail</button>
    </div>

    <!-- General -->
    <div class="tab-content active" id="tab-general">
      <div class="grid-2" style="gap:16px">
        <div>
          <div class="panel">
            <div class="panel-header">Motion</div>
            <div class="panel-body">
              <div class="stat-row"><span class="stat-label">Speed</span><span class="stat-value mono" id="v-speed">─</span></div>
              <div class="stat-row"><span class="stat-label">Gear</span><span class="stat-value" id="v-gear">─</span></div>
              <div class="stat-row"><span class="stat-label">RPM</span><span class="stat-value mono" id="v-rpm">─</span></div>
              <div class="stat-row"><span class="stat-label">Engine Temp</span><span class="stat-value mono" id="v-etemp">─</span></div>
              <div class="stat-row"><span class="stat-label">Throttle</span><span class="stat-value mono" id="v-thr">─</span></div>
              <div class="stat-row"><span class="stat-label">Brake</span><span class="stat-value mono" id="v-brk">─</span></div>
              <div class="stat-row"><span class="stat-label">Steer</span><span class="stat-value mono" id="v-steer">─</span></div>
              <div class="stat-row"><span class="stat-label">DRS</span><span class="stat-value" id="v-drs">─</span></div>
            </div>
          </div>
        </div>
        <div>
          <div class="panel">
            <div class="panel-header">Tyre Temperatures (Surface)</div>
            <div class="panel-body">
              <div class="tyres-grid" id="v-tyres">
                ${["FL","FR","RL","RR"].map(a=>`
                  <div class="tyre-cell">
                    <div class="tyre-circle temp-cool" id="vtc-${a}">
                      <span class="tyre-temp" id="vtt-${a}">─</span>
                      <span class="tyre-unit">°C</span>
                    </div>
                    <div class="tyre-label">${a}</div>
                  </div>`).join("")}
              </div>
              <div style="margin-top:12px">
                <div class="section-title">Inner Temps</div>
                <div class="grid-2" style="gap:4px">
                  ${["FL","FR","RL","RR"].map(a=>`
                    <div class="stat-row"><span class="stat-label">${a}</span><span class="stat-value mono" id="vti-${a}">─</span></div>`).join("")}
                </div>
              </div>
              <div style="margin-top:10px">
                <div class="section-title">Pressures (PSI)</div>
                <div class="grid-2" style="gap:4px">
                  ${["FL","FR","RL","RR"].map(a=>`
                    <div class="stat-row"><span class="stat-label">${a}</span><span class="stat-value mono" id="vtp-${a}">─</span></div>`).join("")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ERS & Fuel -->
    <div class="tab-content" id="tab-ers">
      <div class="grid-2" style="gap:16px">
        <div class="panel">
          <div class="panel-header">Energy Recovery System</div>
          <div class="panel-body">
            <div class="badge-row" id="v-ers-badges"></div>
            <div class="ers-bar-wrap">
              <div class="ers-bar-label"><span>ERS Store</span><span id="v-ers-store">─</span></div>
              <div class="ers-bar-track"><div class="ers-bar-fill" id="v-ers-bar" style="width:0%"></div></div>
            </div>
            <div class="stat-row"><span class="stat-label">Deploy mode</span><span class="stat-value" id="v-ers-mode">─</span></div>
            <div class="stat-row"><span class="stat-label">Deployed this lap</span><span class="stat-value mono" id="v-ers-dep">─</span></div>
            <div class="stat-row"><span class="stat-label">Harvested MGU-K</span><span class="stat-value mono" id="v-ers-hk">─</span></div>
            <div class="stat-row"><span class="stat-label">Harvested MGU-H</span><span class="stat-value mono" id="v-ers-hh">─</span></div>
            <div class="stat-row"><span class="stat-label">ICE Power</span><span class="stat-value mono" id="v-ice-pwr">─</span></div>
            <div class="stat-row"><span class="stat-label">MGU-K Power</span><span class="stat-value mono" id="v-mguk-pwr">─</span></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">Fuel</div>
          <div class="panel-body">
            <div style="margin-bottom:12px">
              <div class="ers-bar-label"><span>Fuel Load</span><span id="v-fuel-pct">─%</span></div>
              <div class="ers-bar-track"><div class="prog-fill fuel" id="v-fuel-bar" style="width:0%;height:100%"></div></div>
            </div>
            <div class="stat-row"><span class="stat-label">In tank</span><span class="stat-value mono" id="v-fuel">─</span></div>
            <div class="stat-row"><span class="stat-label">Capacity</span><span class="stat-value mono" id="v-fuel-cap">─</span></div>
            <div class="stat-row"><span class="stat-label">Laps remaining</span><span class="stat-value mono" id="v-fuel-laps">─</span></div>
            <div class="stat-row"><span class="stat-label">Fuel mix</span><span class="stat-value" id="v-fuel-mix">─</span></div>
            <div class="stat-row"><span class="stat-label">Pit limiter</span><span class="stat-value" id="v-pit-limiter">─</span></div>
            <div class="stat-row"><span class="stat-label">Front brake bias</span><span class="stat-value mono" id="v-brake-bias">─</span></div>
            <div class="stat-row"><span class="stat-label">TC</span><span class="stat-value" id="v-tc">─</span></div>
            <div class="stat-row"><span class="stat-label">ABS</span><span class="stat-value" id="v-abs">─</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Damage -->
    <div class="tab-content" id="tab-damage">
      <div class="grid-2" style="gap:16px">
        <div class="panel">
          <div class="panel-header">Bodywork</div>
          <div class="panel-body">
            <div id="dmg-bodywork"></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">Power Unit Wear</div>
          <div class="panel-body">
            <div id="dmg-engine"></div>
          </div>
        </div>
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-header">Tyre Wear</div>
        <div class="panel-body">
          <div class="grid-4" id="dmg-tyres"></div>
        </div>
      </div>
    </div>

    <!-- Tyre detail -->
    <div class="tab-content" id="tab-tyres">
      <div class="grid-2" style="gap:16px">
        <div class="panel">
          <div class="panel-header">Tyre Info</div>
          <div class="panel-body" id="tyre-info-body"></div>
        </div>
        <div class="panel">
          <div class="panel-header">Brake Temperatures</div>
          <div class="panel-body" id="brake-temp-body"></div>
        </div>
      </div>
    </div>
  `,e("page-vehicle").querySelectorAll(".tab-btn").forEach(a=>{a.addEventListener("click",()=>{e("page-vehicle").querySelectorAll(".tab-btn").forEach(t=>t.classList.remove("active")),e("page-vehicle").querySelectorAll(".tab-content").forEach(t=>t.classList.remove("active")),a.classList.add("active"),e(`tab-${a.dataset.tab}`).classList.add("active")})})}function T(a,t){const i=U(t);return`
    <div class="damage-item" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span class="damage-item-label">${a}</span>
        <span class="damage-pct">${Math.round(t)}%</span>
      </div>
      <div class="damage-item-bar"><div class="damage-fill ${i}" style="width:${$(t,0,100)}%"></div></div>
    </div>`}function tt(){const a=d.telemetry,t=d.status,i=d.damage;if(!a)return;e("v-speed").textContent=a.speed+" km/h",e("v-gear").textContent=a.gear<=0?a.gear===0?"N":"R":a.gear,e("v-rpm").textContent=a.engineRPM.toLocaleString()+" RPM",e("v-etemp").textContent=a.engineTemp+" °C",e("v-thr").textContent=(a.throttle*100).toFixed(1)+"%",e("v-brk").textContent=(a.brake*100).toFixed(1)+"%",e("v-steer").textContent=(a.steer*100).toFixed(1)+"%",e("v-drs").innerHTML=a.drs?'<span class="badge active">ON</span>':'<span class="badge inactive">OFF</span>';const r={RL:0,RR:1,FL:2,FR:3};for(const[l,s]of Object.entries(r)){const o=a.tyreSurfaceTemp[s],n=a.tyreInnerTemp[s],f=a.tyrePressure[s].toFixed(1),g=e(`vtc-${l}`);g&&(g.className=`tyre-circle ${P(o)}`,e(`vtt-${l}`).textContent=o);const p=e(`vti-${l}`);p&&(p.textContent=n+" °C");const c=e(`vtp-${l}`);c&&(c.textContent=f)}if(t){const l=$(t.ersStoreEnergy/4e6*100,0,100);e("v-ers-store").textContent=(t.ersStoreEnergy/1e6).toFixed(2)+" MJ",e("v-ers-bar").style.width=l+"%",l>90?e("v-ers-bar").classList.add("full"):e("v-ers-bar").classList.remove("full");const s=["None","Medium","Overtake","Hotlap"];e("v-ers-mode").textContent=s[t.ersDeployMode]||"None",e("v-ers-dep").textContent=(t.ersDeployedThisLap/1e6).toFixed(2)+" MJ",e("v-ers-hk").textContent=(t.ersHarvestedMGUK/1e6).toFixed(2)+" MJ",e("v-ers-hh").textContent=(t.ersHarvestedMGUH/1e6).toFixed(2)+" MJ",e("v-ice-pwr").textContent=(t.enginePowerICE/1e3).toFixed(0)+" kW",e("v-mguk-pwr").textContent=(t.enginePowerMGUK/1e3).toFixed(0)+" kW";const o=e("v-ers-badges");o&&(o.innerHTML=`
        <span class="badge ${t.drsAllowed?"active":"inactive"}">DRS ${t.drsAllowed?"ON":"OFF"}</span>
        <span class="badge ${t.pitLimiterStatus?"warning":"inactive"}">PIT LIM ${t.pitLimiterStatus?"ON":"OFF"}</span>
        <span class="badge info">${s[t.ersDeployMode]||"ERS"}</span>
      `);const n=$(t.fuelInTank/t.fuelCapacity*100,0,100);e("v-fuel-pct").textContent=n.toFixed(1)+"%",e("v-fuel-bar").style.width=n+"%",e("v-fuel").textContent=t.fuelInTank.toFixed(2)+" kg",e("v-fuel-cap").textContent=t.fuelCapacity.toFixed(1)+" kg",e("v-fuel-laps").textContent=t.fuelRemainingLaps.toFixed(2);const f=["Lean","Standard","Rich","Max"];e("v-fuel-mix").textContent=f[t.fuelMix]||"─",e("v-pit-limiter").textContent=t.pitLimiterStatus?"Active":"Off",e("v-brake-bias").textContent=t.frontBrakeBias+"%",e("v-tc").textContent=["Off","Medium","Full"][t.tractionControl]||"─",e("v-abs").textContent=t.antiLockBrakes?"On":"Off"}if(i){const l=e("dmg-bodywork");l&&(l.innerHTML=T("Front Left Wing",i.frontLeftWingDamage)+T("Front Right Wing",i.frontRightWingDamage)+T("Rear Wing",i.rearWingDamage)+T("Floor",i.floorDamage)+T("Diffuser",i.diffuserDamage)+T("Sidepod",i.sidepodDamage)+T("Gearbox",i.gearBoxDamage));const s=e("dmg-engine");s&&(s.innerHTML=T("ICE",i.engineICEWear)+T("MGU-H",i.engineMGUHWear)+T("MGU-K",i.engineMGUKWear)+T("ES",i.engineESWear)+T("CE",i.engineCEWear)+T("TC",i.engineTCWear));const o=e("dmg-tyres");if(o){const g=["RL","RR","FL","FR"];o.innerHTML=i.tyresWear.map((p,c)=>{const m=Math.round(p),v=U(m);return`
          <div style="text-align:center">
            <div class="tyre-circle ${v==="dmg-low"?"temp-opt":v==="dmg-mid"?"temp-warm":v==="dmg-high"?"temp-hot":"temp-vhot"}" style="margin:0 auto 6px">
              <span class="tyre-temp">${m}%</span>
            </div>
            <div class="tyre-label">${g[c]}</div>
          </div>`}).join("")}const n=e("tyre-info-body");if(n&&a){const g=["RL","RR","FL","FR"];n.innerHTML=g.map((p,c)=>`
        <div class="stat-row">
          <span class="stat-label">${p} Surface</span>
          <span class="stat-value mono ${P(a.tyreSurfaceTemp[c])}">${a.tyreSurfaceTemp[c]} °C</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">${p} Inner</span>
          <span class="stat-value mono ${P(a.tyreInnerTemp[c])}">${a.tyreInnerTemp[c]} °C</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">${p} Wear</span>
          <span class="stat-value mono">${Math.round(i.tyresWear[c])}%</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">${p} Pressure</span>
          <span class="stat-value mono">${a.tyrePressure[c].toFixed(1)} PSI</span>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:4px 0">`).join("")}const f=e("brake-temp-body");if(f&&a){const g=["RL","RR","FL","FR"];f.innerHTML=g.map((p,c)=>{const m=a.brakesTemp[c],v=m>900?"bad":m>700?"warn":m>300?"good":"";return`<div class="stat-row">
          <span class="stat-label">${p}</span>
          <span class="stat-value mono ${v}">${m} °C</span>
        </div>`}).join("")}}}function at(){e("page-session").innerHTML=`
    <div class="session-hero">
      <div class="session-track" id="s-track">─</div>
      <div class="session-type" id="s-type">─</div>
      <div class="session-time" id="s-timeleft">─:──</div>
      <div class="session-laps" id="s-laps">─</div>
    </div>
    <div class="grid-2" style="gap:16px">
      <div class="panel">
        <div class="panel-header">Conditions</div>
        <div class="panel-body">
          <div class="stat-row"><span class="stat-label">Weather</span><span class="stat-value" id="s-weather">─</span></div>
          <div class="stat-row"><span class="stat-label">Track Temp</span><span class="stat-value mono" id="s-ttemp">─</span></div>
          <div class="stat-row"><span class="stat-label">Air Temp</span><span class="stat-value mono" id="s-atemp">─</span></div>
          <div class="stat-row"><span class="stat-label">Pit speed limit</span><span class="stat-value mono" id="s-pit-limit">─</span></div>
          <div class="stat-row"><span class="stat-label">Safety car</span><span class="stat-value" id="s-sc">─</span></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">Session Info</div>
        <div class="panel-body">
          <div class="stat-row"><span class="stat-label">Track length</span><span class="stat-value mono" id="s-length">─</span></div>
          <div class="stat-row"><span class="stat-label">Total laps</span><span class="stat-value" id="s-total-laps">─</span></div>
          <div class="stat-row"><span class="stat-label">Duration</span><span class="stat-value mono" id="s-duration">─</span></div>
          <div class="stat-row"><span class="stat-label">Formula</span><span class="stat-value" id="s-formula">─</span></div>
        </div>
      </div>
    </div>
  `}function et(){const a=d.session;if(!a)return;e("s-track").textContent=a.trackName||"─",e("s-type").textContent=a.sessionTypeName||"─",e("s-timeleft").textContent=N(a.sessionTimeLeft),e("s-laps").textContent=`Total Laps: ${a.totalLaps}`,e("s-weather").innerHTML=`${J(a.weather)} ${a.weatherName}`,e("s-ttemp").textContent=a.trackTemperature+" °C",e("s-atemp").textContent=a.airTemperature+" °C",e("s-pit-limit").textContent=a.pitSpeedLimit+" km/h",e("s-sc").textContent=G(a.safetyCarStatus)||"None",e("s-length").textContent=(a.trackLength/1e3).toFixed(3)+" km",e("s-total-laps").textContent=a.totalLaps,e("s-duration").textContent=N(a.sessionDuration);const t=["F1","F2","F3","F1 Classic","F2 2021","F1 (New)"];e("s-formula").textContent=t[a.formula]||"F1"}function B(a=!0){var g;const t=d.telemetry,i=d.status,r=d.damage,l=(g=d.lapData)==null?void 0:g[d.playerCarIndex],s=d.session,o=["None","Medium","Overtake","Hotlap"],n={};if(s&&(n.track=s.trackName,n.session=s.sessionTypeName,n.weather=s.weatherName,n.totalLaps=s.totalLaps,n.timeLeftSec=s.sessionTimeLeft),l&&(n.myPosition=l.carPosition,n.currentLap=l.currentLapNum,n.lastLapMs=l.lastLapTimeMs,n.currentLapMs=l.currentLapTimeMs,n.pitStops=l.numPitStops,n.gapToCarAheadMs=l.deltaToCarAheadMs,n.gapToLeaderMs=l.deltaToLeaderMs,n.lapInvalid=!!l.currentLapInvalid,n.sector=l.sector),t&&(n.speedKph=t.speed,n.gear=t.gear,n.throttlePct=Math.round(t.throttle*100),n.brakePct=Math.round(t.brake*100),n.engineRPM=t.engineRPM,n.drsActive=!!t.drs,n.tyreSurfaceTemp={RL:t.tyreSurfaceTemp[0],RR:t.tyreSurfaceTemp[1],FL:t.tyreSurfaceTemp[2],FR:t.tyreSurfaceTemp[3]},n.tyreInnerTemp={RL:t.tyreInnerTemp[0],RR:t.tyreInnerTemp[1],FL:t.tyreInnerTemp[2],FR:t.tyreInnerTemp[3]},n.brakesTemp={RL:t.brakesTemp[0],RR:t.brakesTemp[1],FL:t.brakesTemp[2],FR:t.brakesTemp[3]},n.engineTempC=t.engineTemp),i){const p=R[i.visualTyreCompound];n.tyreCompound=(p==null?void 0:p.name)||"Unknown",n.tyreAgeLaps=i.tyresAgeLaps,n.fuelKg=+i.fuelInTank.toFixed(2),n.fuelLapsLeft=+i.fuelRemainingLaps.toFixed(1),n.ersStoreMJ=+(i.ersStoreEnergy/1e6).toFixed(2),n.ersMode=o[i.ersDeployMode]||"None",n.drsAllowed=!!i.drsAllowed,n.pitLimiter=!!i.pitLimiterStatus}if(r&&(n.tyreWearPct={RL:Math.round(r.tyresWear[0]),RR:Math.round(r.tyresWear[1]),FL:Math.round(r.tyresWear[2]),FR:Math.round(r.tyresWear[3])},n.frontWingDmg={L:r.frontLeftWingDamage,R:r.frontRightWingDamage},n.rearWingDmg=r.rearWingDamage,n.floorDmg=r.floorDamage,n.engineWearPct={ICE:r.engineICEWear,MGUH:r.engineMGUHWear,MGUK:r.engineMGUKWear,ES:r.engineESWear,TC:r.engineTCWear}),a&&d.lapData&&l){let b=function(u,L){var S,D,I,A;if(!u||L<0)return null;const x=(S=d.allCarStatus)==null?void 0:S[L],w=(I=(D=d.participants)==null?void 0:D.participants)==null?void 0:I[L],k=x?((A=R[x.visualTyreCompound])==null?void 0:A.name)||"Unknown":null;return{name:(w==null?void 0:w.name)||`Car ${L+1}`,position:u.carPosition,gapToThemMs:u.deltaToCarAheadMs,lastLapMs:u.lastLapTimeMs,tyreCompound:k,tyreAgeLaps:(x==null?void 0:x.tyresAgeLaps)??null,ersStoreMJ:x?+(x.ersStoreEnergy/1e6).toFixed(2):null,ersMode:x?o[x.ersDeployMode]||"None":null,pitStops:u.numPitStops,pitStatus:u.pitStatus}};var f=b;const p=l.carPosition,c=d.lapData.find(u=>(u==null?void 0:u.carPosition)===p-1),m=d.lapData.find(u=>(u==null?void 0:u.carPosition)===p+1),v=c?d.lapData.indexOf(c):-1,y=m?d.lapData.indexOf(m):-1,h=b(c,v),C=b(m,y);h&&(n.carAhead=h),C&&(n.carBehind=C)}return n}function st(){var f,g,p;const a=(f=d.lapData)==null?void 0:f[d.playerCarIndex];if(!a)return null;const t=a.carPosition,i=(g=d.lapData)==null?void 0:g.find(c=>(c==null?void 0:c.carPosition)===t-1),r=(p=d.lapData)==null?void 0:p.find(c=>(c==null?void 0:c.carPosition)===t+1),l=a.deltaToCarAheadMs,s=r==null?void 0:r.deltaToCarAheadMs,o=l>0&&l<1200&&i!=null,n=s!=null&&s>0&&s<1e3;return o&&n?"mixed":o?"attack":n?"defense":null}async function nt(a){var b,h,C;if(M.awaiting)return;M.awaiting=!0;const t=Date.now();M.lastTrigger[a==="mixed"?"attack":a]=t;const i=B(!0),r=(b=d.lapData)==null?void 0:b[d.playerCarIndex];let l="";if(a==="attack"||a==="mixed"){const u=(r==null?void 0:r.deltaToCarAheadMs)??0;l+=`ATTACK SITUATION: Car ahead is ${(u/1e3).toFixed(2)}s in front. Evaluate overtake opportunity.
`}if(a==="defense"||a==="mixed"){const u=r==null?void 0:r.carPosition,L=(h=d.lapData)==null?void 0:h.find(w=>(w==null?void 0:w.carPosition)===u+1),x=(L==null?void 0:L.deltaToCarAheadMs)??0;l+=`DEFENSE SITUATION: Car behind is ${(x/1e3).toFixed(2)}s behind. Evaluate defense requirements.
`}l+="Provide ENGINEER_DECISION output.";const s=e("radio-feed"),o=document.createElement("div");o.className="radio-card thinking",o.innerHTML=`<span class="radio-tag tag-${a}">● ${a.toUpperCase()}</span> <span class="radio-thinking">Engineer thinking…</span>`,s&&s.prepend(o);const n=await window.raceEngineer.askEngineer({question:l,context:i,mode:"ENGINEER_DECISION"});if(o.remove(),M.awaiting=!1,n.error||!n.response){O(a,"medium",n.error||"No response.",!0);return}const f=n.response,g=f.match(/speak:\s*(yes|no)/i),p=f.match(/urgency:\s*(\w+)/i),c=f.match(/radio:\s*(.+)/is),m=g?g[1].toLowerCase()==="yes":!0,v=((C=p==null?void 0:p[1])==null?void 0:C.toLowerCase())||"medium",y=c?c[1].trim().replace(/\n.*/s,""):f.split(`
`).find(u=>u.trim().length>10)||f;m&&O(a,v,y,!1)}function O(a,t,i,r){const l=e("radio-feed");if(!l)return;const s=new Date().toLocaleTimeString("en",{hour:"2-digit",minute:"2-digit",second:"2-digit"}),o=document.createElement("div");for(o.className=`radio-card ${r?"radio-error":""} urgency-${t}`,o.innerHTML=`
    <div class="radio-card-header">
      <span class="radio-tag tag-${a}">${a.toUpperCase()}</span>
      <span class="radio-urgency urgency-${t}">${t.toUpperCase()}</span>
      <span class="radio-time">${s}</span>
    </div>
    <div class="radio-text">${i}</div>
  `,l.prepend(o);l.children.length>20;)l.removeChild(l.lastChild)}let W=0;function it(){if(!M.enabled||!d.connected)return;const a=Date.now();if(a-W<5e3)return;W=a;const t=st();if(!t){M.prevScenario=null;return}const i=t==="mixed"?"attack":t,r=a-(M.lastTrigger[i]||0);(t!==M.prevScenario||r>=M.COOLDOWN_MS)&&(M.prevScenario=t,nt(t))}function lt(){e("page-engineer").innerHTML=`
    <div class="engineer-header">
      <span>🔧</span>
      <h2>AI Race Engineer</h2>
      <span class="model-badge">claude-opus-4-6</span>
      <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
        <label class="context-toggle" style="margin:0">
          <input type="checkbox" id="radio-enabled" checked>
          Auto Radio
        </label>
        <button id="clear-radio" style="font-size:11px;padding:3px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer">Clear</button>
      </div>
    </div>

    <!-- Proximity indicator -->
    <div id="proximity-bar" class="proximity-bar hidden">
      <span id="prox-ahead"></span>
      <span id="prox-me">YOU</span>
      <span id="prox-behind"></span>
    </div>

    <!-- Radio feed (auto-triggered messages) -->
    <div class="radio-feed-wrap">
      <div class="section-title" style="padding:10px 16px 4px;border-bottom:1px solid var(--border)">
        Radio Feed <span style="font-weight:400;color:var(--text3);font-size:10px">(attack / defense only)</span>
      </div>
      <div id="radio-feed" class="radio-feed">
        <div class="radio-feed-empty">No radio messages yet. Triggers when within 1.2s of a rival.</div>
      </div>
    </div>

    <!-- Manual query -->
    <div class="chat-input-area" style="border-top:2px solid var(--border)">
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <span style="font-size:11px;color:var(--text3)">Manual query — ask any tactical question</span>
        <textarea class="chat-input" id="chat-input" placeholder="e.g. Should I box this lap? (Enter to send)" rows="2"></textarea>
      </div>
      <button class="chat-send-btn" id="chat-send">Ask</button>
    </div>

    <!-- Manual response area -->
    <div id="manual-response" class="manual-response hidden">
      <div class="radio-card urgency-medium" id="manual-card">
        <div class="radio-text" id="manual-text"></div>
      </div>
    </div>
  `,e("radio-enabled").addEventListener("change",s=>{M.enabled=s.target.checked}),e("clear-radio").addEventListener("click",()=>{const s=e("radio-feed");s.innerHTML='<div class="radio-feed-empty">Feed cleared.</div>',M.prevScenario=null,M.lastTrigger={attack:0,defense:0}});const a=e("chat-input"),t=e("chat-send"),i=e("manual-response"),r=e("manual-text");async function l(){const s=a.value.trim();if(!s||t.disabled)return;a.value="",t.disabled=!0,t.textContent="…",i.classList.remove("hidden"),r.textContent="Thinking…";const o=B(!0),n=await window.raceEngineer.askEngineer({question:s,context:o,mode:"DRIVER_RADIO"});r.textContent=n.error?"⚠ "+n.error:n.response,t.disabled=!1,t.textContent="Ask"}t.addEventListener("click",l),a.addEventListener("keydown",s=>{s.key==="Enter"&&!s.shiftKey&&(s.preventDefault(),l())})}function rt(){var y,b,h,C,u,L,x,w,k;const a=e("proximity-bar");if(!a)return;const t=(y=d.lapData)==null?void 0:y[d.playerCarIndex];if(!t){a.classList.add("hidden");return}const i=t.carPosition,r=(b=d.lapData)==null?void 0:b.find(S=>(S==null?void 0:S.carPosition)===i-1),l=(h=d.lapData)==null?void 0:h.find(S=>(S==null?void 0:S.carPosition)===i+1),s=t.deltaToCarAheadMs,o=l==null?void 0:l.deltaToCarAheadMs,n=r?d.lapData.indexOf(r):-1,f=l?d.lapData.indexOf(l):-1,g=((L=(u=(C=d.participants)==null?void 0:C.participants)==null?void 0:u[n])==null?void 0:L.name)||(r?`P${i-1}`:null),p=((k=(w=(x=d.participants)==null?void 0:x.participants)==null?void 0:w[f])==null?void 0:k.name)||(l?`P${i+1}`:null);if(!(s>0&&s<1200||o!=null&&o<1e3)){a.classList.add("hidden");return}a.classList.remove("hidden");const m=e("prox-ahead"),v=e("prox-behind");m&&(g&&s>0&&s<1200?(m.textContent=`${g}  +${(s/1e3).toFixed(2)}s`,m.className="prox-rival prox-attack"):(m.textContent="",m.className="prox-rival")),v&&(p&&o!=null&&o<1e3?(v.textContent=`${p}  -${(o/1e3).toFixed(2)}s`,v.className="prox-rival prox-defend"):(v.textContent="",v.className="prox-rival"))}function dt(){e("page-settings").innerHTML=`
    <div style="max-width:540px">
      <div class="settings-section">
        <h3>Telemetry Connection</h3>
        <div class="panel">
          <div class="panel-body">
            <div class="stat-row"><span class="stat-label">Listen port</span><span class="stat-value mono">20777</span></div>
            <div class="stat-row"><span class="stat-label">Protocol</span><span class="stat-value">UDP</span></div>
            <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value" id="set-conn-status">Offline</span></div>
            <p class="settings-note" style="margin-top:10px">
              In your game: Settings → Telemetry → UDP Telemetry: On, IP = <strong>your PC's local IP</strong>, Port = <strong>20777</strong>, Format = F1 25, Send Rate = 60Hz.
            </p>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>AI Race Engineer (Claude API)</h3>
        <div class="settings-field">
          <label>Anthropic API Key</label>
          <input type="password" class="settings-input" id="api-key-input" placeholder="sk-ant-..." />
        </div>
        <button class="settings-save-btn" id="save-api-key">Save Key</button>
        <p class="settings-note">Your API key is only stored in memory for this session. Get a key at console.anthropic.com. The AI Engineer uses <strong>claude-opus-4-6</strong>.</p>
      </div>
    </div>
  `,e("save-api-key").addEventListener("click",()=>{const a=e("api-key-input").value.trim();a&&(window.raceEngineer.setApiKey(a),e("save-api-key").textContent="✓ Saved",setTimeout(()=>{e("save-api-key").textContent="Save Key"},2e3))})}function q(){var t;const a=(t=document.querySelector(".page.active"))==null?void 0:t.id;z(),a==="page-dashboard"&&V(),a==="page-timing"&&X(),a==="page-vehicle"&&tt(),a==="page-session"&&et(),a==="page-engineer"&&rt(),it(),requestAnimationFrame(q)}async function ot(){const a=await window.raceEngineer.getLookups();H=a.TEAM_COLORS,R=a.TYRE_COMPOUNDS,Y(),Q(),Z(),at(),lt(),dt(),document.querySelectorAll(".nav-item").forEach(t=>{t.addEventListener("click",i=>{i.preventDefault(),K(t.dataset.page)})}),e("btn-start").addEventListener("click",()=>{window.raceEngineer.startTelemetry()}),window.raceEngineer.onTelemetryStarted(t=>{d.connected=!0,e("connection-dot").className="conn-dot online",e("connection-label").textContent=`Live · UDP :${t.port}`,e("btn-start").textContent="● Listening",e("btn-start").className="start-btn listening";const i=e("set-conn-status");i&&(i.textContent="Connected")}),window.raceEngineer.onSessionUpdate(t=>{d.session=t,d.playerCarIndex=t.playerCarIndex??0}),window.raceEngineer.onLapUpdate(t=>{d.lapData=t.lapData,d.playerCarIndex=t.playerCarIndex??0}),window.raceEngineer.onTelemetryUpdate(t=>{d.telemetry=t}),window.raceEngineer.onStatusUpdate(t=>{d.status=t}),window.raceEngineer.onDamageUpdate(t=>{d.damage=t}),window.raceEngineer.onParticipantsUpdate(t=>{d.participants=t}),window.raceEngineer.onAllStatusUpdate(t=>{d.allCarStatus=t}),requestAnimationFrame(q)}ot();
