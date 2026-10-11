/**
 * Antigravity Context Monitor — Landing Page Interactive Telemetry Simulator
 * Handles real-time interactive cockpit, sparkbar scrubbing, and animations.
 */

document.addEventListener('DOMContentLoaded', () => {
  initCopyButtons();
  initCodeTabs();
  initSimulator();
});

// ===========================================================================
// Copy-to-Clipboard Handlers
// ===========================================================================
function initCopyButtons() {
  const btn = document.getElementById('btn-copy-hero');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const textToCopy = 'git clone https://github.com/jaytaykay/antigravity-context-monitor.git "$env:USERPROFILE\\.gemini\\config\\plugins\\context-monitor"';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 2000);
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
    }
  });
}

// ===========================================================================
// Code Snippet Tabs
// ===========================================================================
function initCodeTabs() {
  const tabs = document.querySelectorAll('.btn-tab');
  const winContent = document.getElementById('tab-content-win');
  const posixContent = document.getElementById('tab-content-posix');

  if (!tabs.length || !winContent || !posixContent) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.getAttribute('data-tab');
      if (target === 'win') {
        winContent.classList.remove('hidden');
        posixContent.classList.add('hidden');
      } else {
        winContent.classList.add('hidden');
        posixContent.classList.remove('hidden');
      }
    });
  });
}

// ===========================================================================
// Interactive Telemetry Simulator
// ===========================================================================
function initSimulator() {
  // Baseline State
  const state = {
    model: 'pro',
    maxTokens: 2_000_000,
    modelName: 'Gemini Pro 2.0M',
    cachedTokens: 84_400,
    freshTokens: 3_300,
    outputTokens: 407,
    currentStep: 117,
    // 16 turns history (inputTokens)
    turns: [
      { step: 102, input: 2400, output: 210 },
      { step: 103, input: 3100, output: 350 },
      { step: 104, input: 2800, output: 190 },
      { step: 105, input: 3400, output: 420 },
      { step: 106, input: 2900, output: 230 },
      { step: 107, input: 2600, output: 180 },
      { step: 108, input: 3200, output: 390 },
      { step: 109, input: 4500, output: 520 },
      { step: 110, input: 3100, output: 280 },
      { step: 111, input: 2700, output: 210 },
      { step: 112, input: 2900, output: 260 },
      { step: 113, input: 3800, output: 390 },
      { step: 114, input: 3200, output: 340 },
      { step: 115, input: 3600, output: 141 },
      { step: 116, input: 2800, output: 310 },
      { step: 117, input: 3300, output: 407 },
    ],
    subagents: [
      { name: 'Architecture Researcher', role: 'Subagent', status: 'idle', statusText: '⚪ IDLE' },
      { name: 'Telemetry Engine Optimizer', role: 'Subagent', status: 'running', statusText: '🟢 RUNNING' },
    ]
  };

  const initialCopy = JSON.parse(JSON.stringify(state));

  // DOM Elements
  const elTokensActive = document.getElementById('sim-tokens-active');
  const elTokensLimit = document.getElementById('sim-tokens-limit');
  const elPctBadge = document.getElementById('sim-pct-badge');
  const elRemainText = document.getElementById('sim-remain-text');
  const elBarCached = document.getElementById('sim-bar-cached');
  const elBarFresh = document.getElementById('sim-bar-fresh');
  const elStatCached = document.getElementById('sim-stat-cached');
  const elStatFresh = document.getElementById('sim-stat-fresh');
  const elStatOutput = document.getElementById('sim-stat-output');
  const elModelBadge = document.getElementById('sim-live-model-badge');
  const elModelTag = document.getElementById('sim-model-tag');
  const elHealthDot = document.getElementById('sim-health-dot');
  const elSparkContainer = document.getElementById('sim-sparkbars-container');
  const elSparkReadout = document.getElementById('sim-spark-readout');
  const elAxisOldest = document.getElementById('sim-axis-oldest');
  const elAxisLatest = document.getElementById('sim-axis-latest');
  const elAgentList = document.getElementById('sim-agent-list');
  const elSubCount = document.getElementById('sim-sub-count');

  function formatCompactNum(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  function render() {
    const totalTokens = state.cachedTokens + state.freshTokens;
    const pct = Math.min(100, (totalTokens / state.maxTokens) * 100);
    const cachedPct = (state.cachedTokens / state.maxTokens) * 100;
    const freshPct = (state.freshTokens / state.maxTokens) * 100;
    const remaining = Math.max(0, state.maxTokens - totalTokens);

    // Numeric Labels
    if (elTokensActive) elTokensActive.textContent = formatCompactNum(totalTokens);
    if (elTokensLimit) elTokensLimit.textContent = state.maxTokens >= 2_000_000 ? '2.0M' : '1.0M';
    if (elPctBadge) elPctBadge.textContent = `${pct.toFixed(1)}%`;
    if (elRemainText) elRemainText.textContent = `${formatCompactNum(remaining)} remaining`;

    // Legend
    if (elStatCached) elStatCached.textContent = formatCompactNum(state.cachedTokens);
    if (elStatFresh) elStatFresh.textContent = formatCompactNum(state.freshTokens);
    if (elStatOutput) elStatOutput.textContent = String(state.outputTokens);

    // Capacity Bar
    if (elBarCached) elBarCached.style.width = `${cachedPct.toFixed(2)}%`;
    if (elBarFresh) elBarFresh.style.width = `${freshPct.toFixed(2)}%`;

    // Health Dot
    if (elHealthDot) {
      elHealthDot.className = 'sim-health-dot';
      if (pct >= 90) elHealthDot.classList.add('critical');
      else if (pct >= 75) elHealthDot.classList.add('warning');
      else elHealthDot.classList.add('nominal');
    }

    // Sparkbars Chart
    renderSparkbars();

    // Agent Fleet
    renderSubagents();
  }

  function renderSparkbars() {
    if (!elSparkContainer) return;
    elSparkContainer.innerHTML = '';

    const maxInput = Math.max(6000, ...state.turns.map(t => t.input));

    state.turns.forEach((turn, idx) => {
      const bar = document.createElement('div');
      bar.className = 'sim-bar-item';

      if (turn.input > 25000) bar.classList.add('critical');
      else if (turn.input > 10000) bar.classList.add('elevated');

      const h = Math.max(12, Math.min(100, (turn.input / maxInput) * 100));
      bar.style.height = `${h}%`;

      // Hover updates header readout
      bar.addEventListener('mouseenter', () => {
        elSparkReadout.textContent = `Step ${turn.step} • ${formatCompactNum(turn.input)} in, ${turn.output} out`;
      });
      bar.addEventListener('mouseleave', () => {
        const latest = state.turns[state.turns.length - 1];
        elSparkReadout.textContent = `Step ${latest.step} • ${formatCompactNum(latest.input)} in, ${latest.output} out`;
      });

      elSparkContainer.appendChild(bar);
    });

    const oldest = state.turns[0];
    const latest = state.turns[state.turns.length - 1];
    if (elAxisOldest) elAxisOldest.textContent = `Step ${oldest.step}`;
    if (elAxisLatest) elAxisLatest.textContent = `Step ${latest.step} (Latest)`;
    if (elSparkReadout) elSparkReadout.textContent = `Step ${latest.step} • ${formatCompactNum(latest.input)} in, ${latest.output} out`;
  }

  function renderSubagents() {
    if (!elAgentList) return;
    elAgentList.innerHTML = '';

    state.subagents.forEach(sub => {
      const row = document.createElement('div');
      row.className = 'sim-agent-row';
      row.innerHTML = `
        <div class="agent-row-left">
          <span class="agent-name">${sub.name}</span>
          <span class="agent-badge">${sub.role}</span>
        </div>
        <span class="agent-status ${sub.status}">${sub.statusText}</span>
      `;
      elAgentList.appendChild(row);
    });

    if (elSubCount) {
      elSubCount.textContent = `${state.subagents.length} Active Workers`;
    }
  }

  function pushTurn(inputTok, outputTok) {
    state.currentStep += 1;
    state.cachedTokens += Math.floor(state.freshTokens * 0.95);
    state.freshTokens = inputTok;
    state.outputTokens = outputTok;

    // Shift 16 turns window
    state.turns.shift();
    state.turns.push({
      step: state.currentStep,
      input: inputTok,
      output: outputTok
    });

    render();
  }

  // Model Preset Switchers
  const modelBtns = document.querySelectorAll('.btn-model-preset');
  modelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modelBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');

      const model = btn.getAttribute('data-model');
      if (model === 'flash') {
        state.model = 'flash';
        state.maxTokens = 1_000_000;
        state.modelName = 'Gemini 3.8 Flash 1.0M';
      } else {
        state.model = 'pro';
        state.maxTokens = 2_000_000;
        state.modelName = 'Gemini Pro 2.0M';
      }

      if (elModelBadge) elModelBadge.textContent = state.modelName;
      if (elModelTag) elModelTag.textContent = state.modelName;
      render();
    });
  });

  // Action Buttons
  document.getElementById('btn-sim-query')?.addEventListener('click', () => {
    pushTurn(3200, 380);
  });

  document.getElementById('btn-sim-file')?.addEventListener('click', () => {
    pushTurn(14500, 410);
  });

  document.getElementById('btn-sim-term')?.addEventListener('click', () => {
    pushTurn(28000, 720);
  });

  document.getElementById('btn-sim-subagent')?.addEventListener('click', () => {
    const roles = ['Dependency Auditor', 'AST Refactor Engine', 'Visual Regression Tester', 'E2E Runner'];
    const nextName = roles[state.subagents.length % roles.length];
    state.subagents.push({
      name: nextName,
      role: 'Subagent',
      status: 'running',
      statusText: '🟢 RUNNING'
    });
    pushTurn(18500, 560);
  });

  document.getElementById('btn-sim-reset')?.addEventListener('click', () => {
    Object.assign(state, JSON.parse(JSON.stringify(initialCopy)));
    render();
  });

  // Initial render
  render();
}
