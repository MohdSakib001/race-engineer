export function createRadioConfigPage(deps) {
  const {
    radio,
    el,
    RADIO_CATEGORIES,
    countAiEnabledSituations,
    showPurchaseModal,
    rerenderRadioConfig,
  } = deps;

  function buildRadioConfig() {
    const cats = Object.entries(RADIO_CATEGORIES);
    const categoriesHTML = cats.map(([key, cat]) => {
      const isEnabled = radio.config[key]?.enabled !== false;
      const isAiEnabled = radio.config[key]?.aiEnabled === true;
      const sitCount = cat.situations.length;
      const situationsHTML = cat.situations.map((sit) => {
        const label = sit.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const sitEnabled = radio.config[key]?.situations?.[sit] !== false;
        return `<label class="radio-sit-item">
          <input type="checkbox" class="radio-sit-cb" data-cat="${key}" data-sit="${sit}" ${sitEnabled ? 'checked' : ''}>
          <span class="radio-sit-label">${label}</span>
        </label>`;
      }).join('');
      return `
        <div class="radio-cat-card ${isEnabled ? '' : 'disabled'}" data-cat="${key}">
          <div class="radio-cat-header">
            <label class="radio-cat-toggle">
              <input type="checkbox" class="radio-cat-cb" data-cat="${key}" ${isEnabled ? 'checked' : ''}>
              <span class="radio-cat-icon">${cat.icon}</span>
              <span class="radio-cat-title">${cat.label}</span>
              <span class="radio-cat-count">${sitCount} situations</span>
            </label>
            <label class="radio-ai-toggle" title="Use GPT Realtime AI voice for this category (requires GPT mode + credits)">
              <input type="checkbox" class="radio-ai-cb" data-cat="${key}" ${isAiEnabled ? 'checked' : ''}>
              <span class="radio-ai-label">AI</span>
            </label>
            <button
              type="button"
              class="radio-cat-expand"
              data-cat="${key}"
              aria-expanded="false"
              aria-controls="radio-sits-${key}"
              aria-label="Show situations"
            ></button>
          </div>
          <div class="radio-cat-desc">${cat.description}</div>
          <div class="radio-cat-situations hidden" id="radio-sits-${key}">
            ${situationsHTML}
          </div>
        </div>`;
    }).join('');
    const activeSits = countAiEnabledSituations(radio.config);
    el('page-radio').innerHTML = `
      <div class="radio-config-page">
        <div class="radio-config-header">
          <h2>Radio Configuration</h2>
          <p class="radio-config-subtitle">Select which situations the race engineer will speak about. Toggle categories on/off, or expand to control individual situations.
            Enable <strong>AI</strong> on categories to use GPT Realtime voice (requires GPT mode + credits).</p>
          <div class="radio-config-actions">
            <button id="radio-enable-all" class="radio-action-btn">Enable All</button>
            <button id="radio-disable-all" class="radio-action-btn secondary">Disable All</button>
            <button id="radio-ai-enable-all" class="radio-action-btn" style="background:rgba(100,120,255,0.15);border-color:#6478ff55;color:#9ab">AI: All</button>
            <button id="radio-ai-disable-all" class="radio-action-btn secondary">AI: None</button>
            <label class="context-toggle" style="margin-left:auto">
              <input type="checkbox" id="radio-master-toggle" ${radio.enabled ? 'checked' : ''}>
              Master Radio On/Off
            </label>
          </div>
          <div class="radio-ai-info" id="radio-ai-info">
            GPT AI enabled on <strong id="radio-ai-count">${activeSits}</strong> situations.
            More situations = higher credit usage per race.
            <a href="#" id="radio-open-purchase" style="color:var(--accent)">Buy credits -></a>
          </div>
        </div>
        <div class="radio-cat-grid">
          ${categoriesHTML}
        </div>
        <div class="radio-config-footer">
          <div class="radio-config-info">
            <strong>How it works:</strong> In <em>Classic</em> mode, all messages use edge-tts voice (free).
            In <em>GPT Realtime</em> mode, categories marked <strong>AI</strong> use GPT-4o voice - realistic, tactical, dynamic.
            Categories without AI still use edge-tts.
          </div>
        </div>
      </div>
    `;

    function updateAiCount() {
      const count = countAiEnabledSituations(radio.config);
      const countEl = el('radio-ai-count');
      if (countEl) countEl.textContent = count;
    }

    el('radio-master-toggle').addEventListener('change', (e) => {
      radio.enabled = e.target.checked;
      const engineerToggle = el('radio-enabled');
      if (engineerToggle) engineerToggle.checked = e.target.checked;
    });

    el('radio-enable-all').addEventListener('click', () => {
      for (const key of Object.keys(RADIO_CATEGORIES)) {
        radio.config[key].enabled = true;
        for (const sit of RADIO_CATEGORIES[key].situations) {
          radio.config[key].situations[sit] = true;
        }
      }
      rerenderRadioConfig();
    });
    el('radio-disable-all').addEventListener('click', () => {
      for (const key of Object.keys(RADIO_CATEGORIES)) {
        radio.config[key].enabled = false;
      }
      rerenderRadioConfig();
    });
    el('radio-ai-enable-all').addEventListener('click', () => {
      for (const key of Object.keys(RADIO_CATEGORIES)) {
        radio.config[key].aiEnabled = true;
      }
      rerenderRadioConfig();
    });
    el('radio-ai-disable-all').addEventListener('click', () => {
      for (const key of Object.keys(RADIO_CATEGORIES)) {
        radio.config[key].aiEnabled = false;
      }
      rerenderRadioConfig();
    });

    el('radio-open-purchase')?.addEventListener('click', (e) => {
      e.preventDefault();
      showPurchaseModal();
    });

    el('page-radio').querySelectorAll('.radio-cat-cb').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const cat = e.target.dataset.cat;
        radio.config[cat].enabled = e.target.checked;
        const card = e.target.closest('.radio-cat-card');
        card.classList.toggle('disabled', !e.target.checked);
      });
    });

    el('page-radio').querySelectorAll('.radio-ai-cb').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const cat = e.target.dataset.cat;
        radio.config[cat].aiEnabled = e.target.checked;
        updateAiCount();
      });
    });

    el('page-radio').querySelectorAll('.radio-sit-cb').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const cat = e.target.dataset.cat;
        const sit = e.target.dataset.sit;
        radio.config[cat].situations[sit] = e.target.checked;
      });
    });

    el('page-radio').querySelectorAll('.radio-cat-expand').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        const sitsEl = el(`radio-sits-${cat}`);
        const isExpanded = sitsEl.classList.toggle('hidden') === false;
        btn.classList.toggle('expanded', isExpanded);
        btn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        btn.setAttribute('aria-label', isExpanded ? 'Hide situations' : 'Show situations');
      });
    });
  }

  return { buildRadioConfig };
}
