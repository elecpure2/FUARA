(() => {
  const TXT = {
    misc: '\uAE30\uD0C0',
    monthly: '\uC6D4 \uAD6C\uB3C5',
    monthlyDesc: '\uAC31\uC2E0\uC77C, \uC6D4 \uBE44\uC6A9, \uC0AC\uC6A9\uD6A8\uC728\uC744 \uD55C\uBC88\uC5D0 \uAD00\uB9AC\uD569\uB2C8\uB2E4.',
    homeTitle: '\uAE30\uD0C0 \uC139\uC158',
    homeSub: '\uD544\uC694\uD55C \uAD00\uB9AC \uC139\uC158\uC744 \uCD94\uAC00\uD558\uACE0, \uCE74\uB4DC\uB97C \uB20C\uB7EC \uD398\uC774\uC9C0\uB85C \uC9C4\uC785\uD569\uB2C8\uB2E4.',
    addSection: '\uC139\uC158 \uCD94\uAC00',
    addPrompt: '\uC0C8 \uC139\uC158 \uC774\uB984\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.',
    back: '\uB4A4\uB85C',
    customReady: '\uC774 \uC139\uC158\uC740 \uC544\uC9C1 \uC900\uBE44 \uC911\uC785\uB2C8\uB2E4.',
    customHint: '\uD604\uC7AC\uB294 \uC6D4 \uAD6C\uB3C5 \uC139\uC158\uC774 \uBA3C\uC800 \uC5F4\uB9AC\uB3C4\uB85D \uAD6C\uC131\uD588\uACE0, \uCD94\uAC00 \uC139\uC158\uC740 \uB2E4\uC74C \uB2E8\uACC4\uC5D0\uC11C \uB0B4\uC6A9\uC744 \uBD99\uC785\uB2C8\uB2E4.',
    missingApi: '\uC6D4 \uAD6C\uB3C5 API\uAC00 \uC5F0\uACB0\uB418\uC5B4 \uC788\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.',
    loadFailed: '\uC6D4 \uAD6C\uB3C5 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
    empty: '\uC544\uC9C1 \uB4F1\uB85D\uB41C \uC6D4 \uAD6C\uB3C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC704\uC5D0\uC11C \uCCAB \uAD6C\uB3C5\uC744 \uCD94\uAC00\uD574 \uBCF4\uC138\uC694.',
    loading: '\uC6D4 \uAD6C\uB3C5 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...',
  };

  const CUSTOM_KEY = 'fuara_misc_sections_v1';
  const MASK_KEY = 'fuara_price_masked';
  const USD_KRW_RATE = 1482; // 2026-03-08 기준 환율 — 앱 업데이트 시 갱신

  const state = {
    active: false,
    route: 'home',
    currentSectionId: null,
    editingId: null,
    renderToken: 0,
    transitionLock: false,
    customSections: loadCustomSections(),
    priceMasked: window.localStorage.getItem(MASK_KEY) === '1',
    cachedSubscriptions: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const visibleClassTargets = [
    '#hub-view',
    '#task-list',
    '#calendar-view',
    '#notes-view',
    '#schedule-view',
    '#in-progress-section',
    '.add-task-bar',
    '.add-schedule-bar',
    '#sub-tab-bar',
    '.status-bar',
  ];

  function el(sel) {
    return document.querySelector(sel);
  }

  function miscView() {
    return $('#misc-view');
  }

  function loadCustomSections() {
    try {
      const raw = window.localStorage.getItem(CUSTOM_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => ({
          id: String(item.id || ''),
          title: String(item.title || '').trim(),
          description: String(item.description || '').trim(),
        }))
        .filter((item) => item.id && item.title)
        .slice(0, 12);
    } catch (_) {
      return [];
    }
  }

  function persistCustomSections() {
    try {
      window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(state.customSections));
    } catch (_) {
      // ignore
    }
  }

  function sectionList() {
    return [
      {
        id: 'monthly',
        title: TXT.monthly,
        description: TXT.monthlyDesc,
        kind: 'monthly',
      },
      ...state.customSections.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description || '\uCEE4\uC2A4\uD140 \uC139\uC158',
        kind: 'custom',
      })),
    ];
  }

  function setHeader(title) {
    const titleEl = $('#view-title');
    const headerActions = document.querySelector('.header-actions');
    if (titleEl) titleEl.textContent = title;
    if (headerActions) headerActions.classList.add('hidden');
    const prevBtn = $('#btn-date-prev');
    const nextBtn = $('#btn-date-next');
    if (prevBtn) prevBtn.classList.add('hidden');
    if (nextBtn) nextBtn.classList.add('hidden');
  }

  function restoreHeaderButtons() {
    const prevBtn = $('#btn-date-prev');
    const nextBtn = $('#btn-date-next');
    const headerActions = document.querySelector('.header-actions');
    if (prevBtn) prevBtn.classList.remove('hidden');
    if (nextBtn) nextBtn.classList.remove('hidden');
    if (headerActions) headerActions.classList.remove('hidden');
  }

  function setSidebarActive(view) {
    document.querySelectorAll('.sidebar-item[data-view]').forEach((button) => {
      if (button.dataset.view === 'project') return;
      button.classList.toggle('active', button.dataset.view === view);
    });
  }

  function hideNativeViews() {
    visibleClassTargets.forEach((sel) => {
      const node = el(sel);
      if (node) node.classList.add('hidden');
    });
  }

  function showMiscShell() {
    hideNativeViews();
    const container = miscView();
    if (container) container.classList.remove('hidden');
    setSidebarActive('misc');
    setHeader(TXT.misc);
  }

  function leaveMiscMode() {
    if (!state.active) return;
    state.active = false;
    state.route = 'home';
    state.currentSectionId = null;
    state.editingId = null;
    state.transitionLock = false;
    state.cachedSubscriptions = null;
    const container = miscView();
    if (container) {
      container.classList.add('hidden');
      container.innerHTML = '';
    }
    restoreHeaderButtons();
    const statusBar = el('.status-bar');
    if (statusBar) statusBar.classList.remove('hidden');
  }

  function escHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showConfirm(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h3>${escHtml(message)}</h3>
          <div class="modal-actions">
            <button class="btn-cancel" data-confirm-cancel>취소</button>
            <button class="btn-confirm" data-confirm-ok>확인</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const cleanup = (result) => { overlay.remove(); resolve(result); };
      overlay.querySelector('[data-confirm-ok]').addEventListener('click', () => cleanup(true));
      overlay.querySelector('[data-confirm-cancel]').addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    });
  }

  function renderSectionHome(container) {
    const sections = sectionList();
    container.innerHTML = `
      <div class="misc-page misc-home-page">
        <section class="misc-home-head">
          <h2 class="misc-home-title">${escHtml(TXT.homeTitle)}</h2>
          <p class="misc-home-sub">${escHtml(TXT.homeSub)}</p>
        </section>

        <section class="misc-section-grid">
          ${sections.map((section) => `
            <button class="misc-section-tile ${section.kind === 'monthly' ? 'is-primary' : ''}" data-misc-open-section="${escHtml(section.id)}" type="button">
              <div class="misc-section-tile-title">${escHtml(section.title)}</div>
              <div class="misc-section-tile-sub">${escHtml(section.description)}</div>
            </button>
          `).join('')}

          <button class="misc-section-tile is-add" data-misc-add-section type="button">
            <div class="misc-section-symbol">+</div>
            <div class="misc-section-tile-sub">${escHtml(TXT.addSection)}</div>
          </button>
        </section>
      </div>
    `;
  }

  function renderCustomSectionPage(container) {
    const current = state.customSections.find((item) => item.id === state.currentSectionId);
    const title = current?.title || TXT.addSection;
    container.innerHTML = `
      <div class="misc-page">
        <div class="misc-detail-head">
          <button class="misc-back-btn" data-misc-back-home type="button">${escHtml(TXT.back)}</button>
          <div class="misc-detail-title-wrap">
            <div class="misc-detail-eyebrow">${escHtml(TXT.misc)}</div>
            <h2 class="misc-detail-title">${escHtml(title)}</h2>
          </div>
        </div>
        <div class="misc-card misc-custom-placeholder">
          <div class="misc-section-title">${escHtml(TXT.customReady)}</div>
          <div class="misc-section-sub">${escHtml(TXT.customHint)}</div>
        </div>
      </div>
    `;
  }

  function enterSection(sectionId, tileNode) {
    if (state.transitionLock) return;
    state.transitionLock = true;
    if (tileNode) tileNode.classList.add('is-entering');

    window.setTimeout(async () => {
      state.transitionLock = false;
      state.editingId = null;
      state.currentSectionId = sectionId;
      state.route = sectionId === 'monthly' ? 'monthly' : 'custom';
      await renderMiscView();
    }, 180);
  }

  function addCustomSection() {
    const raw = window.prompt(TXT.addPrompt, '');
    if (!raw) return;
    const title = raw.trim();
    if (!title) return;

    const id = `custom-${Date.now()}`;
    state.customSections.unshift({
      id,
      title,
      description: '\uCEE4\uC2A4\uD140 \uC139\uC158',
    });
    state.customSections = state.customSections.slice(0, 12);
    persistCustomSections();
    renderMiscView();
  }

  function formatMoney(amount, currency) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return '-';
    try {
      return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
      }).format(numeric);
    } catch (_) {
      return `${currency || 'USD'} ${numeric}`;
    }
  }

  const MASK = '******';
  function maskedPrice(realHtml) {
    return state.priceMasked ? MASK : realHtml;
  }

  function formatMetric(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '-';
    if (Math.abs(numeric) >= 100 || Number.isInteger(numeric)) return String(Math.round(numeric));
    return numeric.toFixed(1);
  }

  function startOfDay(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function billingDateForMonth(year, monthIndex, billingDay) {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return new Date(year, monthIndex, Math.min(Number(billingDay) || 1, lastDay));
  }

  function nextBillingDate(billingDay, now = new Date()) {
    const today = startOfDay(now);
    let target = billingDateForMonth(today.getFullYear(), today.getMonth(), billingDay);
    if (target < today) {
      target = billingDateForMonth(today.getFullYear(), today.getMonth() + 1, billingDay);
    }
    return target;
  }

  function usagePercentOf(subscription) {
    if (subscription.credit_exhausted) return 100;
    const limit = Number(subscription.credit_limit);
    const used = Number(subscription.credit_used);
    if (Number.isFinite(limit) && limit > 0 && Number.isFinite(used) && used >= 0) {
      return (used / limit) * 100;
    }
    const manual = Number(subscription.usage_percent);
    return Number.isFinite(manual) && manual >= 0 ? manual : null;
  }

  function importanceLabel(value) {
    return ({
      critical: '\uB9E4\uC6B0 \uC911\uC694',
      high: '\uC911\uC694',
      medium: '\uBCF4\uD1B5',
      low: '\uB0AE\uC74C',
    })[value] || '\uBCF4\uD1B5';
  }

  function buildInsight(subscription, usagePercent) {
    if (subscription.credit_exhausted) {
      return {
        tone: 'hot',
        label: '\uD06C\uB808\uB527 \uC870\uAE30 \uC18C\uC9C4',
        detail: '\uAC31\uC2E0 \uC804\uC5D0 \uD55C\uB3C4\uB97C \uB2E4 \uC368\uBC84\uB9B0 \uAD6C\uB3C5\uC785\uB2C8\uB2E4. \uC0C1\uC704 \uD50C\uB79C \uC720\uC9C0 \uAC00\uCE58\uAC00 \uB192\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
      };
    }
    if (usagePercent === null) {
      return {
        tone: 'muted',
        label: '\uC0AC\uC6A9\uB7C9 \uAE30\uB85D \uD544\uC694',
        detail: '\uC0AC\uC6A9\uB7C9\uC744 \uAE30\uB85D\uD574 \uB450\uBA74 \uB2E4\uC74C \uAC31\uC2E0 \uC804\uC5D0 \uC720\uC9C0 \uC5EC\uBD80\uB97C \uB354 \uC815\uD655\uD788 \uD310\uB2E8\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
      };
    }
    if (usagePercent >= 95) {
      return {
        tone: 'good',
        label: '\uAC70\uC758 \uC804\uBD80 \uC0AC\uC6A9 \uC911',
        detail: '\uC774 \uAD6C\uB3C5\uC740 \uC6D4 \uC694\uAE08 \uB300\uBE44 \uC2E4\uC81C \uD65C\uC6A9\uB3C4\uAC00 \uB192\uC2B5\uB2C8\uB2E4.',
      };
    }
    if (usagePercent >= 75) {
      return {
        tone: 'good',
        label: '\uAC00\uC131\uBE44 \uC591\uD638',
        detail: '\uD604\uC7AC \uD50C\uB79C\uC744 \uC720\uC9C0\uD574\uB3C4 \uBB34\uB9AC\uAC00 \uC5C6\uC5B4 \uBCF4\uC785\uB2C8\uB2E4.',
      };
    }
    if (usagePercent >= 50) {
      return {
        tone: 'neutral',
        label: '\uB2E4\uC74C \uACB0\uC81C \uC804 \uC7AC\uC810\uAC80',
        detail: '\uB2F9\uC7A5 \uC904\uC77C \uC815\uB3C4\uB294 \uC544\uB2C8\uC9C0\uB9CC \uB2E4\uC74C \uAC31\uC2E0 \uC804\uC5D0 \uB2E4\uC2DC \uBCF4\uB294 \uD3B8\uC774 \uC88B\uC2B5\uB2C8\uB2E4.',
      };
    }
    return {
      tone: subscription.importance === 'critical' ? 'neutral' : 'warn',
      label: subscription.importance === 'critical' ? '\uC911\uC694\uD558\uC9C0\uB9CC \uC800\uC0AC\uC6A9' : '\uB2E4\uC6B4\uADF8\uB808\uC774\uB4DC \uD6C4\uBCF4',
      detail: subscription.importance === 'critical'
        ? '\uD544\uC218 \uC11C\uBE44\uC2A4\uB77C\uBA74 \uC720\uC9C0\uD558\uB418 \uC2E4\uC81C \uC0AC\uC6A9 \uB8E8\uD2F4\uC744 \uB2E4\uC2DC \uC810\uAC80\uD574 \uBCF4\uC138\uC694.'
        : '\uD604\uC7AC \uC0AC\uC6A9\uB7C9\uC774\uBA74 \uB354 \uB0AE\uC740 \uD50C\uB79C\uC774\uB098 \uD574\uC9C0 \uAC80\uD1A0 \uAC00\uCE58\uAC00 \uD07D\uB2C8\uB2E4.',
    };
  }

  function analyzeSubscription(subscription) {
    const usagePercent = usagePercentOf(subscription);
    const renewal = nextBillingDate(subscription.billing_day);
    const daysLeft = Math.round((renewal - startOfDay()) / 86400000);
    return {
      subscription,
      usagePercent,
      renewal,
      daysLeft,
      insight: buildInsight(subscription, usagePercent),
    };
  }

  function summarize(entries) {
    const totals = {};
    let dueSoon = 0;
    let exhausted = 0;
    let underused = 0;
    let trackedUsageCount = 0;
    let trackedUsageTotal = 0;

    for (const entry of entries) {
      const currency = (entry.subscription.currency || 'USD').toUpperCase();
      totals[currency] = (totals[currency] || 0) + Number(entry.subscription.monthly_price || 0);
      if (entry.daysLeft <= 7) dueSoon += 1;
      if (entry.subscription.credit_exhausted) exhausted += 1;
      if (entry.usagePercent !== null) {
        trackedUsageCount += 1;
        trackedUsageTotal += entry.usagePercent;
        if (entry.usagePercent < 50) underused += 1;
      }
    }

    return {
      totals,
      dueSoon,
      exhausted,
      underused,
      totalCount: entries.length,
      averageUsage: trackedUsageCount > 0 ? Math.round(trackedUsageTotal / trackedUsageCount) : null,
    };
  }

  function renderLoadState(container, message) {
    container.innerHTML = `
      <div class="misc-shell">
        <section class="misc-section">
          <div class="misc-card misc-empty-card">${escHtml(message)}</div>
        </section>
      </div>
    `;
  }

  function readForm() {
    return {
      service_name: $('#subscription-service-name')?.value?.trim(),
      plan_name: $('#subscription-plan-name')?.value?.trim(),
      start_date: $('#subscription-start-date')?.value || null,
      billing_day: $('#subscription-billing-day')?.value || null,
      monthly_price: $('#subscription-monthly-price')?.value || null,
      currency: $('#subscription-currency')?.value || 'USD',
      credit_limit: $('#subscription-credit-limit')?.value || null,
      credit_used: $('#subscription-credit-used')?.value || null,
      usage_percent: $('#subscription-usage-percent')?.value || null,
      importance: $('#subscription-importance')?.value || 'medium',
      credit_exhausted: Boolean($('#subscription-credit-exhausted')?.checked),
      has_credit_tracking: Boolean($('#subscription-has-credit')?.checked),
      notes: $('#subscription-notes')?.value?.trim() || null,
    };
  }

  function renderForm(editing) {
    const current = editing || {};
    return `
      <div class="misc-card misc-form-card">
        <div class="misc-card-head">
          <div>
            <div class="misc-section-title">\uC6D4 \uAD6C\uB3C5 ${editing ? '\uC218\uC815' : '\uCD94\uAC00'}</div>
            <div class="misc-section-sub">\uAC31\uC2E0\uC77C, \uC6D4 \uC694\uAE08, \uC0AC\uC6A9\uB7C9, \uC911\uC694\uB3C4\uB97C \uD568\uAED8 \uAE30\uB85D\uD569\uB2C8\uB2E4.</div>
          </div>
          ${editing ? '<span class="misc-editing-chip">\uD3B8\uC9D1 \uC911</span>' : ''}
        </div>
        <div class="misc-form-grid">
          <label class="misc-field">
            <span>\uC11C\uBE44\uC2A4\uBA85</span>
            <input id="subscription-service-name" type="text" value="${escHtml(current.service_name || '')}" placeholder="ChatGPT, Cursor, Midjourney" />
          </label>
          <label class="misc-field">
            <span>\uD50C\uB79C\uBA85</span>
            <input id="subscription-plan-name" type="text" value="${escHtml(current.plan_name || '')}" placeholder="Plus, Ultra, Pro" />
          </label>
          <label class="misc-field">
            <span>\uC2DC\uC791\uC77C</span>
            <input id="subscription-start-date" type="date" value="${escHtml(current.start_date || '')}" />
          </label>
          <label class="misc-field">
            <span>\uB9E4\uC6D4 \uACB0\uC81C\uC77C</span>
            <input id="subscription-billing-day" type="number" min="1" max="31" value="${escHtml(current.billing_day ?? '')}" placeholder="25" />
          </label>
          <label class="misc-field">
            <span>\uC6D4 \uAD6C\uB3C5\uB8CC</span>
            <input id="subscription-monthly-price" type="number" min="0" step="0.01" value="${escHtml(current.monthly_price ?? '')}" placeholder="30" />
          </label>
          <label class="misc-field">
            <span>\uD1B5\uD654</span>
            <select id="subscription-currency">
              <option value="USD" ${current.currency === 'USD' || !current.currency ? 'selected' : ''}>USD</option>
              <option value="KRW" ${current.currency === 'KRW' ? 'selected' : ''}>KRW</option>
              <option value="JPY" ${current.currency === 'JPY' ? 'selected' : ''}>JPY</option>
              <option value="EUR" ${current.currency === 'EUR' ? 'selected' : ''}>EUR</option>
              <option value="GBP" ${current.currency === 'GBP' ? 'selected' : ''}>GBP</option>
            </select>
          </label>
          <label class="misc-field">
            <span>\uCD1D \uD06C\uB808\uB527</span>
            <input id="subscription-credit-limit" type="number" min="0" step="0.01" value="${escHtml(current.credit_limit ?? '')}" placeholder="200" />
          </label>
          <label class="misc-field">
            <span>\uD604\uC7AC \uC0AC\uC6A9\uB7C9</span>
            <input id="subscription-credit-used" type="number" min="0" step="0.01" value="${escHtml(current.credit_used ?? '')}" placeholder="150" />
          </label>
          <label class="misc-field">
            <span>\uC0AC\uC6A9\uB960(%)</span>
            <input id="subscription-usage-percent" type="number" min="0" step="0.1" value="${escHtml(current.usage_percent ?? '')}" placeholder="\uBE44\uC728\uB9CC \uAE30\uB85D\uD560 \uB54C" />
          </label>
          <label class="misc-field">
            <span>\uC911\uC694\uB3C4</span>
            <select id="subscription-importance">
              <option value="critical" ${current.importance === 'critical' ? 'selected' : ''}>\uB9E4\uC6B0 \uC911\uC694</option>
              <option value="high" ${current.importance === 'high' ? 'selected' : ''}>\uC911\uC694</option>
              <option value="medium" ${current.importance === 'medium' || !current.importance ? 'selected' : ''}>\uBCF4\uD1B5</option>
              <option value="low" ${current.importance === 'low' ? 'selected' : ''}>\uB0AE\uC74C</option>
            </select>
          </label>
        </div>
        <label class="misc-toggle-row">
          <input id="subscription-has-credit" type="checkbox" ${current.has_credit_tracking !== 0 ? 'checked' : ''} />
          <span>\uD06C\uB808\uB527 \uD6A8\uC728 \uCD94\uC801 (OFF \uC2DC \uD6A8\uC728 \uBCF4\uB4DC \uB9E8 \uB4A4\uB85C \uBC30\uCE58)</span>
        </label>
        <label class="misc-toggle-row">
          <input id="subscription-credit-exhausted" type="checkbox" ${current.credit_exhausted ? 'checked' : ''} />
          <span>\uC774\uBC88 \uC0AC\uC774\uD074\uC5D0\uC11C \uD06C\uB808\uB527\uC744 \uC774\uBBF8 \uB2E4 \uC37C\uC74C</span>
        </label>
        <label class="misc-field misc-field-full">
          <span>\uBA54\uBAA8</span>
          <textarea id="subscription-notes" rows="3" placeholder="\uD558\uC704 \uD50C\uB79C \uAC80\uD1A0, \uAC31\uC2E0 \uC804 \uCCB4\uD06C \uD3EC\uC778\uD2B8, \uC0AC\uC6A9 \uC2B5\uAD00 \uBA54\uBAA8">${escHtml(current.notes || '')}</textarea>
        </label>
        <div class="misc-form-actions">
          <button class="misc-btn misc-btn-primary" data-misc-save-subscription>${editing ? '\uC218\uC815 \uC800\uC7A5' : '\uC6D4 \uAD6C\uB3C5 \uCD94\uAC00'}</button>
          ${editing ? '<button class="misc-btn" data-misc-cancel-edit>\uD3B8\uC9D1 \uCDE8\uC18C</button>' : ''}
        </div>
      </div>
    `;
  }

  function renderCalendar(entries) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayLabels = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'];
    const byDay = new Map();

    for (const entry of entries) {
      const day = billingDateForMonth(year, month, entry.subscription.billing_day).getDate();
      const list = byDay.get(day) || [];
      list.push(entry);
      byDay.set(day, list);
    }

    let cells = '';
    for (let i = 0; i < startDow; i += 1) {
      cells += '<div class="misc-calendar-cell empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const items = byDay.get(day) || [];
      cells += `
        <div class="misc-calendar-cell ${items.length > 0 ? 'has-items' : ''} ${day === now.getDate() ? 'today' : ''}">
          <div class="misc-calendar-day">${day}</div>
          <div class="misc-calendar-items">
            ${items.slice(0, 2).map((entry) => `<span class="misc-calendar-pill">${escHtml(entry.subscription.service_name)}</span>`).join('')}
            ${items.length > 2 ? `<span class="misc-calendar-more">+${items.length - 2}</span>` : ''}
          </div>
        </div>
      `;
    }

    return `
      <div class="misc-card misc-calendar-card">
        <div class="misc-card-head">
          <div>
            <div class="misc-section-title">\uC774\uBC88 \uB2EC \uAC31\uC2E0 \uCE98\uB9B0\uB354</div>
            <div class="misc-section-sub">\uC774\uBC88 \uB2EC\uC5D0 \uC5B8\uC81C \uC5B4\uB5A4 \uAD6C\uB3C5\uC774 \uAC31\uC2E0\uB418\uB294\uC9C0 \uBC14\uB85C \uD655\uC778\uD569\uB2C8\uB2E4.</div>
          </div>
          <span class="misc-month-chip">${year}\uB144 ${month + 1}\uC6D4</span>
        </div>
        <div class="misc-calendar-grid misc-calendar-weekdays">
          ${dayLabels.map((label) => `<div class="misc-calendar-weekday">${label}</div>`).join('')}
        </div>
        <div class="misc-calendar-grid">${cells}</div>
      </div>
    `;
  }

  function renderSubscriptionCard(entry) {
    const usagePercent = entry.usagePercent;
    const progressWidth = usagePercent === null ? 8 : Math.max(8, Math.min(100, Math.round(usagePercent)));
    const usageLabel = usagePercent === null ? '\uC0AC\uC6A9\uB7C9 \uBBF8\uAE30\uB85D' : `${Math.round(usagePercent)}% \uC0AC\uC6A9`;
    const detailLabel = entry.subscription.credit_limit != null && entry.subscription.credit_used != null
      ? `${formatMetric(entry.subscription.credit_used)} / ${formatMetric(entry.subscription.credit_limit)}`
      : usagePercent === null ? '-' : `${Math.round(usagePercent)}%`;
    const renewLabel = entry.daysLeft <= 0 ? '\uC624\uB298 \uAC31\uC2E0' : `${entry.daysLeft}\uC77C \uB0A8\uC74C`;
    return `
      <article class="misc-card misc-subscription-card tone-${escHtml(entry.insight.tone)}">
        <div class="misc-subscription-top">
          <div>
            <div class="misc-subscription-title-row">
              <h3>${escHtml(entry.subscription.service_name)}</h3>
              <span class="misc-importance-chip ${escHtml(entry.subscription.importance || 'medium')}">${escHtml(importanceLabel(entry.subscription.importance))}</span>
            </div>
            <div class="misc-subscription-plan">${escHtml(entry.subscription.plan_name || '\uD50C\uB79C\uBA85 \uC5C6\uC74C')}</div>
          </div>
          <div class="misc-subscription-price">${maskedPrice(entry.subscription.currency === 'USD'
      ? '\u20A9' + Math.round(entry.subscription.monthly_price * USD_KRW_RATE).toLocaleString('ko-KR') + ' <span class="misc-price-orig">($' + entry.subscription.monthly_price + ')</span>'
      : '\u20A9' + Number(entry.subscription.monthly_price).toLocaleString('ko-KR')
    )}</div>
        </div>
        <div class="misc-subscription-meta-grid">
          <div class="misc-subscription-meta">
            <span>\uB2E4\uC74C \uAC31\uC2E0</span>
            <strong>${escHtml(entry.renewal.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }))}</strong>
            <small>${escHtml(renewLabel)}</small>
          </div>
          <div class="misc-subscription-meta">
            <span>\uC0AC\uC6A9\uB7C9</span>
            <strong>${escHtml(usageLabel)}</strong>
            <small>${escHtml(detailLabel)}</small>
          </div>
        </div>
        <div class="misc-progress-block">
          <div class="misc-progress-head">
            <span>이번 사이클 효율</span>
            <span>
              <span data-usage-display="${entry.subscription.id}">${usagePercent === null ? '-' : `${Math.round(usagePercent)}%`}</span>
              <button class="misc-usage-edit-btn" data-misc-toggle-usage-slider="${entry.subscription.id}" type="button">수정</button>
            </span>
          </div>
          <div class="misc-progress-track">
            <div class="misc-progress-fill" data-usage-fill="${entry.subscription.id}" style="width:${progressWidth}%"></div>
          </div>
          <div class="misc-usage-slider-wrap hidden" data-usage-slider-wrap="${entry.subscription.id}">
            <input type="range" class="misc-usage-slider" data-misc-usage-slider="${entry.subscription.id}" min="0" max="100" value="${usagePercent === null ? 0 : Math.round(usagePercent)}" />
          </div>
        </div>
        <div class="misc-insight ${escHtml(entry.insight.tone)}">
          <div class="misc-insight-label">${escHtml(entry.insight.label)}</div>
          <div class="misc-insight-copy">${escHtml(entry.insight.detail)}</div>
        </div>
        ${entry.subscription.notes ? `<div class="misc-note-copy">${escHtml(entry.subscription.notes)}</div>` : ''}
        <div class="misc-card-actions">
          ${entry.usagePercent !== null ? `${entry.usagePercent !== null ? `<button class="misc-action-link" data-misc-toggle-exhausted="${entry.subscription.id}" data-current="${entry.subscription.credit_exhausted ? '1' : '0'}">${entry.subscription.credit_exhausted ? '\uB2E4\uC500 \uD574\uC81C' : '\uD06C\uB808\uB527 \uB2E4\uC500'}</button>` : ''}` : ''}
          <button class="misc-action-link" data-misc-edit-subscription="${entry.subscription.id}">\uC218\uC815</button>
          <button class="misc-action-link misc-danger-link" data-misc-delete-subscription="${entry.subscription.id}">\uC0AD\uC81C</button>
        </div>
      </article>
    `;
  }

  async function renderMonthlyView() {
    if (!state.active) return;
    const container = miscView();
    if (!container) return;

    showMiscShell();

    // 캐시가 있으면 API 호출 없이 바로 렌더링 (깜빡임 방지)
    let subscriptions;
    if (state.cachedSubscriptions) {
      subscriptions = state.cachedSubscriptions;
    } else {
      const token = ++state.renderToken;
      renderLoadState(container, TXT.loading);

      try {
        if (typeof window.orbit?.getMonthlySubscriptions !== 'function') {
          throw new Error(TXT.missingApi);
        }
        const result = await window.orbit.getMonthlySubscriptions();
        subscriptions = Array.isArray(result) ? result : [];
      } catch (error) {
        if (!state.active || token !== state.renderToken) return;
        const message = error instanceof Error ? error.message : TXT.loadFailed;
        container.innerHTML = `
          <div class="misc-shell">
            <section class="misc-section">
              <div class="misc-card misc-empty-card">
                <div>${escHtml(TXT.loadFailed)}</div>
                <div style="margin-top:8px;opacity:0.8;">${escHtml(message)}</div>
                <div class="misc-form-actions" style="margin-top:14px;">
                  <button class="misc-btn misc-btn-primary" data-misc-retry>\uB2E4\uC2DC \uBD88\uB7EC\uC624\uAE30</button>
                </div>
              </div>
            </section>
          </div>
        `;
        return;
      }

      if (!state.active || token !== state.renderToken) return;
      state.cachedSubscriptions = subscriptions;
    }

    const entries = subscriptions
      .map(analyzeSubscription)
      .sort((a, b) => {
        const impOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const impA = impOrder[a.subscription.importance] ?? 2;
        const impB = impOrder[b.subscription.importance] ?? 2;
        if (impA !== impB) return impA - impB;
        return a.daysLeft - b.daysLeft;
      });
    const summary = summarize(entries);
    const editing = entries.find((entry) => entry.subscription.id === state.editingId)?.subscription || null;
    // D-day alert banner for subscriptions due within 7 days
    const upcomingEntries = entries.filter(e => e.daysLeft >= 0 && e.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft);
    let ddayBannerHtml = '';
    if (upcomingEntries.length > 0) {
      const ddayItems = upcomingEntries.map(e => {
        const dayLabel = e.daysLeft === 0 ? 'D-DAY' : `D-${e.daysLeft}`;
        const rawPrice = e.subscription.currency === 'USD'
          ? '\u20A9' + Math.round(e.subscription.monthly_price * USD_KRW_RATE).toLocaleString('ko-KR') + ' ($' + e.subscription.monthly_price + ')'
          : '\u20A9' + Number(e.subscription.monthly_price).toLocaleString('ko-KR');
        const price = maskedPrice(rawPrice);
        return `<div class="misc-dday-item"><span class="misc-dday-badge ${e.daysLeft <= 2 ? 'misc-dday-urgent' : ''}">${dayLabel}</span><span class="misc-dday-name">${escHtml(e.subscription.service_name)}</span><span class="misc-dday-price">${price}</span></div>`;
      }).join('');
      ddayBannerHtml = `<div class="misc-dday-banner"><div class="misc-dday-title">\uD83D\uDD14 \uACB0\uC81C \uC608\uC815</div>${ddayItems}</div>`;
    }
    // Combine all currencies into total KRW
    const usdTotal = summary.totals['USD'] || 0;
    const krwTotal = summary.totals['KRW'] || 0;
    const totalKrw = krwTotal + Math.round(usdTotal * USD_KRW_RATE);
    const totalsHtml = totalKrw > 0
      ? `<span class="misc-total-pill misc-total-big">⚡ 월 ${maskedPrice('\u20A9' + totalKrw.toLocaleString('ko-KR'))}</span>` +
      (usdTotal > 0 ? `<span class="misc-total-pill misc-total-sub">${maskedPrice('($' + usdTotal + ' + \u20A9' + krwTotal.toLocaleString('ko-KR') + ')')}</span>` : '')
      : '';

    container.innerHTML = `
      <div class="misc-shell">
        <section class="misc-hero">
          <div class="misc-hero-main misc-card">
            <div class="misc-eyebrow">${TXT.misc}</div>
            <h2 class="misc-title">${TXT.monthly} <button class="misc-mask-btn" data-misc-toggle-mask type="button">${state.priceMasked ? '💰 금액 보기' : '🙈 금액 숨기기'}</button></h2>
            <p class="misc-copy">\uD55C \uB2EC\uB9C8\uB2E4 \uB098\uAC00\uB294 \uAD6C\uB3C5\uC774 \uC5B8\uC81C \uAC31\uC2E0\uB418\uB294\uC9C0, \uBE44\uC6A9 \uB300\uBE44 \uC5BC\uB9C8\uB098 \uC798 \uC4F0\uACE0 \uC788\uB294\uC9C0, \uD06C\uB808\uB527\uC774 \uB108\uBB34 \uBE68\uB9AC \uB2F3\uAC70\uB098 \uB108\uBB34 \uB9CE\uC774 \uB0A8\uB294\uC9C0 \uD55C \uD654\uBA74\uC5D0\uC11C \uBD05\uB2C8\uB2E4.</p>
            <div class="misc-total-strip">
              ${totalsHtml || '<span class="misc-total-pill">\uB4F1\uB85D\uB41C \uC6D4 \uAD6C\uB3C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</span>'}
            </div>
            ${ddayBannerHtml}
          </div>
          <div class="misc-hero-side">
            <div class="misc-kpi-grid">
              <div class="misc-card misc-kpi-card">
                <div class="misc-kpi-label">\uB4F1\uB85D\uB41C \uAD6C\uB3C5</div>
                <div class="misc-kpi-value">${summary.totalCount}</div>
                <div class="misc-kpi-sub">\uCD94\uC801 \uC911\uC778 \uC6D4 \uAD6C\uB3C5 \uC218</div>
              </div>
              <div class="misc-card misc-kpi-card">
                <div class="misc-kpi-label">7\uC77C \uC774\uB0B4 \uAC31\uC2E0</div>
                <div class="misc-kpi-value">${summary.dueSoon}</div>
                <div class="misc-kpi-sub">\uACF3 \uACB0\uC81C\uB418\uB294 \uAD6C\uB3C5</div>
              </div>
              <div class="misc-card misc-kpi-card">
                <div class="misc-kpi-label">\uC870\uAE30 \uC18C\uC9C4</div>
                <div class="misc-kpi-value">${summary.exhausted}</div>
                <div class="misc-kpi-sub">\uC774\uBBF8 \uD06C\uB808\uB527\uC744 \uB2E4 \uC4F4 \uAD6C\uB3C5</div>
              </div>
              <div class="misc-card misc-kpi-card">
                <div class="misc-kpi-label">\uD3C9\uADE0 \uC0AC\uC6A9\uB960</div>
                <div class="misc-kpi-value">${summary.averageUsage === null ? '-' : `${summary.averageUsage}%`}</div>
                <div class="misc-kpi-sub">\uC0AC\uC6A9\uB7C9 \uC785\uB825\uC774 \uC788\uB294 \uAD6C\uB3C5 \uAE30\uC900</div>
              </div>
            </div>
          </div>
        </section>

        <section class="misc-section">
          <div class="misc-section-head">
            <div>
              <div class="misc-section-title">구독 효율 보드</div>
              <div class="misc-section-sub">가격, 중요도, 남은 기간, 실제 사용량을 같이 보면서 유지할 구독과 줄일 구독을 구분합니다.</div>
            </div>
          </div>
          ${(() => {
        if (entries.length === 0) return `<div class="misc-card misc-empty-card">${TXT.empty}</div>`;
        const hasCredit = (e) => e.subscription.has_credit_tracking;
        const tracked = entries.filter(hasCredit);
        const untracked = entries.filter(e => !hasCredit(e));
        console.log('[FUARA] Grouping:', tracked.map(e => e.subscription.service_name), '|', untracked.map(e => e.subscription.service_name));
        let html = '';
        if (tracked.length > 0) {
          html += `<div class="misc-group-label">\ud06c\ub808\ub527 \ud6a8\uc728 \ucd94\uc801 \uc911</div>`;
          html += `<div class="misc-card-grid">${tracked.map(renderSubscriptionCard).join('')}</div>`;
        }
        if (tracked.length > 0 && untracked.length > 0) {
          html += `<div class="misc-group-divider"></div>`;
        }
        if (untracked.length > 0) {
          html += `<div class="misc-group-label">\ud6a8\uc728 \ucd94\uc801 \uc5c6\uc74c</div>`;
          html += `<div class="misc-card-grid">${untracked.map(renderSubscriptionCard).join('')}</div>`;
        }
        return html;
      })()}
        </section>

        <section class="misc-section">
          <div class="misc-section-head">
            <div>
              <div class="misc-section-title">등록 + 캘린더</div>
              <div class="misc-section-sub">왼쪽에서 월 구독을 등록하고 오른쪽에서 이번 달 갱신 캘린더를 확인합니다.</div>
            </div>
          </div>
          <div class="misc-top-grid">
            ${renderForm(editing)}
            ${renderCalendar(entries)}
          </div>
        </section>
      </div>
    `;
  }

  async function renderMiscView() {
    if (!state.active) return;
    const container = miscView();
    if (!container) return;

    showMiscShell();

    if (state.route === 'home') {
      renderSectionHome(container);
      return;
    }

    if (state.route === 'monthly') {
      await renderMonthlyView();
      return;
    }

    renderCustomSectionPage(container);
  }

  async function openMiscView() {
    state.active = true;
    state.route = 'home';
    state.currentSectionId = null;
    state.editingId = null;
    await renderMiscView();
  }

  async function saveSubscription() {
    const payload = readForm();
    if (!payload.service_name) {
      window.alert('\uC11C\uBE44\uC2A4\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.');
      return;
    }
    if (!payload.monthly_price && payload.monthly_price !== 0) {
      window.alert('\uC6D4 \uAD6C\uB3C5\uB8CC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.');
      return;
    }
    if (!payload.billing_day && !payload.start_date) {
      window.alert('\uC2DC\uC791\uC77C \uB610\uB294 \uB9E4\uC6D4 \uACB0\uC81C\uC77C \uC911 \uD558\uB098\uB294 \uC785\uB825\uD574 \uC8FC\uC138\uC694.');
      return;
    }

    if (state.editingId) {
      if (typeof window.orbit?.updateMonthlySubscription !== 'function') {
        window.alert(TXT.missingApi);
        return;
      }
      await window.orbit.updateMonthlySubscription(state.editingId, payload);
    } else {
      if (typeof window.orbit?.createMonthlySubscription !== 'function') {
        window.alert(TXT.missingApi);
        return;
      }
      await window.orbit.createMonthlySubscription(payload);
    }

    state.editingId = null;
    state.cachedSubscriptions = null;
    await renderMiscView();
  }

  document.addEventListener('click', async (event) => {
    const miscSidebarButton = event.target.closest('.sidebar-item[data-view="misc"]');
    if (miscSidebarButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await openMiscView();
      return;
    }

    const otherSidebarButton = event.target.closest('.sidebar-item');
    if (otherSidebarButton) {
      leaveMiscMode();
      return;
    }

    if (!state.active) return;

    if (event.target.closest('[data-misc-back-home]')) {
      state.route = 'home';
      state.currentSectionId = null;
      state.editingId = null;
      await renderMiscView();
      return;
    }

    if (event.target.closest('[data-misc-add-section]')) {
      addCustomSection();
      return;
    }

    const sectionTile = event.target.closest('[data-misc-open-section]');
    if (sectionTile) {
      const sectionId = sectionTile.dataset.miscOpenSection;
      if (sectionId) enterSection(sectionId, sectionTile);
      return;
    }

    if (event.target.closest('[data-misc-toggle-mask]')) {
      state.priceMasked = !state.priceMasked;
      try { window.localStorage.setItem(MASK_KEY, state.priceMasked ? '1' : '0'); } catch (_) { }
      await renderMiscView();
      return;
    }

    if (event.target.closest('[data-misc-toggle-usage-slider]')) {
      const btn = event.target.closest('[data-misc-toggle-usage-slider]');
      const id = btn.dataset.miscToggleUsageSlider;
      const wrap = document.querySelector(`[data-usage-slider-wrap="${id}"]`);
      if (wrap) wrap.classList.toggle('hidden');
      return;
    }

    if (state.route !== 'monthly') return;

    if (event.target.closest('[data-misc-retry]')) {
      state.cachedSubscriptions = null;
      await renderMiscView();
      return;
    }

    if (event.target.closest('[data-misc-save-subscription]')) {
      await saveSubscription();
      return;
    }

    if (event.target.closest('[data-misc-cancel-edit]')) {
      state.editingId = null;
      await renderMiscView();
      return;
    }

    const editButton = event.target.closest('[data-misc-edit-subscription]');
    if (editButton) {
      state.editingId = Number(editButton.dataset.miscEditSubscription);
      await renderMiscView();
      const formCard = document.querySelector('.misc-form-card');
      if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const deleteButton = event.target.closest('[data-misc-delete-subscription]');
    if (deleteButton) {
      const ok = await showConfirm('이 월 구독 항목을 삭제할까요?');
      if (!ok) return;
      const id = Number(deleteButton.dataset.miscDeleteSubscription);
      if (typeof window.orbit?.deleteMonthlySubscription !== 'function') {
        window.alert(TXT.missingApi);
        return;
      }
      await window.orbit.deleteMonthlySubscription(id);
      if (state.editingId === id) state.editingId = null;
      state.cachedSubscriptions = null;
      await renderMiscView();
      return;
    }

    // Usage slider — update on input (live) and save on change
    const slider = event.target.closest('[data-misc-usage-slider]');
    if (slider) {
      const id = Number(slider.dataset.miscUsageSlider);
      const val = Number(slider.value);
      // Update display label in real-time
      const display = document.querySelector(`[data-usage-display="${id}"]`);
      if (display) display.textContent = val + '%';
      // Save on change (mouseup / touchend)
      if (event.type === 'change') {
        if (typeof window.orbit?.updateMonthlySubscription === 'function') {
          await window.orbit.updateMonthlySubscription(id, { usage_percent: val });
        }
      }
      return;
    }

    const exhaustedButton = event.target.closest('[data-misc-toggle-exhausted]');
    if (exhaustedButton) {
      const id = Number(exhaustedButton.dataset.miscToggleExhausted);
      const current = exhaustedButton.dataset.current === '1';
      if (typeof window.orbit?.updateMonthlySubscription !== 'function') {
        window.alert(TXT.missingApi);
        return;
      }
      await window.orbit.updateMonthlySubscription(id, { credit_exhausted: !current });
      state.cachedSubscriptions = null;
      await renderMiscView();
    }
  }, true);

  // Slider: real-time display update on input
  document.addEventListener('input', (event) => {
    const slider = event.target.closest('[data-misc-usage-slider]');
    if (!slider) return;
    const id = slider.dataset.miscUsageSlider;
    const val = slider.value;
    const display = document.querySelector(`[data-usage-display="${id}"]`);
    if (display) display.textContent = val + '%';
    const fill = document.querySelector(`[data-usage-fill="${id}"]`);
    if (fill) fill.style.width = Math.max(8, Number(val)) + '%';
  }, true);

  // Slider: save to DB on change (mouseup)
  document.addEventListener('change', async (event) => {
    const slider = event.target.closest('[data-misc-usage-slider]');
    if (!slider) return;
    const id = Number(slider.dataset.miscUsageSlider);
    const val = Number(slider.value);
    if (typeof window.orbit?.updateMonthlySubscription === 'function') {
      await window.orbit.updateMonthlySubscription(id, { usage_percent: val });
    }
  }, true);

})();
