// Frontend Controller for Context Monitor UI Extension.
const sidecar = window.sidecar;
const $ = (id) => document.getElementById(id);

// Application State
let lastData = null;
let selectedTurnIndex = null;
let hoveredTurnIndex = null;
let refreshTimer = null;

// ===========================================================================
// API Communication
// ===========================================================================
async function callApi(path, body = {}) {
  if (sidecar && typeof sidecar.fetch === 'function') {
    try {
      const res = await sidecar.fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('sidecar.fetch failed, using window.fetch fallback', e);
    }
  }

  // Standalone dev server / direct fetch fallback
  const params = new URLSearchParams();
  if (body.conversationId) params.append('conversationId', body.conversationId);
  if (body.targetId) params.append('targetId', body.targetId);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${path}${q}`, { method: 'GET' });
  return await res.json();
}

function formatNum(n) {
  if (n === undefined || n === null || isNaN(n)) return '0';
  return Number(n).toLocaleString();
}

function formatCompactNum(n) {
  if (n === undefined || n === null || isNaN(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ===========================================================================
// Core Telemetry & UI Renderers
// ===========================================================================
function updateUi(data) {
  lastData = data;
  if (!data || !data.found) {
    $('conv-title').textContent = data?.title || 'Context Monitor';
    $('agent-role-chip').textContent = 'No Active Session';
    return;
  }

  // Header info
  $('conv-title').textContent = data.title || 'Context Monitor';
  $('agent-role-chip').textContent = data.agentName || (data.isSubagent ? 'Subagent' : 'Main Agent');
  $('session-label').textContent = `id: ${data.conversationId ? data.conversationId.slice(0, 8) + '...' : '–'}`;

  // 1. Auto-Detected Model & Capacity Meter
  renderCapacityAndModel(data);

  // 2. Interactive Turn Velocity Graph (with In-Graph Header Readout)
  renderSparkChart(data);

  // 3. Context Payload Attribution Accordions (with dropdown hints)
  renderAttributionDrawers(data);

  // 4. Agent Tree & Active Step
  renderAgentTree(data);

  // 5. Apply URL Inspection / Drawer options
  applyUrlOptions(data);
}

function applyUrlOptions(data) {
  try {
    const params = new URLSearchParams(window.location.search);

    // Subagent demo mode for visual testing / previews
    if (params.get('demo') === 'multiagent' && (!data.subagents || data.subagents.length === 0)) {
      data.subagents = [
        { conversationId: 'sub-research', agentName: 'Architecture Researcher', isRunning: false, latestTool: 'read_url_content', totalContextTokens: 14250 },
        { conversationId: 'sub-builder', agentName: 'Telemetry Engine Optimizer', isRunning: true, latestTool: 'run_command: cargo test', totalContextTokens: 38920 }
      ];
      renderAgentTree(data);
    }

    // Inspect peak turn or target step
    const inspect = params.get('inspect');
    if (inspect && data.recentTurns && data.recentTurns.length > 0) {
      let targetIdx = -1;
      if (inspect === 'peak') {
        let maxTok = -1;
        data.recentTurns.forEach((t, i) => {
          if ((t.inputTokens || 0) > maxTok) {
            maxTok = t.inputTokens || 0;
            targetIdx = i;
          }
        });
      } else if (inspect === 'latest') {
        targetIdx = data.recentTurns.length - 1;
      } else if (!isNaN(parseInt(inspect, 10))) {
        targetIdx = parseInt(inspect, 10);
      }
      if (targetIdx >= 0 && targetIdx < data.recentTurns.length) {
        selectedTurnIndex = targetIdx;
        openStepInspector(data.recentTurns[targetIdx]);
        renderSparkChart(data);
      }
    }

    // Open accordion drawers
    const openDrawers = params.get('open');
    if (openDrawers) {
      if (openDrawers === 'all') {
        document.querySelectorAll('.attr-drawer').forEach(d => { d.open = true; });
      } else {
        openDrawers.split(',').forEach(id => {
          const d = $(`drawer-${id.trim()}`);
          if (d) d.open = true;
        });
      }
    }
  } catch (e) {
    console.warn('Error applying URL options:', e);
  }
}

function renderCapacityAndModel(data) {
  const model = data.model || { modelName: 'Gemini 3.8 Flash', maxTokens: 1_000_000, displayLimit: '1.0M' };
  const latest = data.latest || {};
  const currentLimit = model.maxTokens || 1_000_000;
  const totalTokens = latest.totalContextTokens || 0;
  const cacheTokens = latest.cacheReadTokens || 0;
  const freshTokens = latest.inputTokens || 0;
  const outputTokens = latest.outputTokens || 0;

  // Auto-Detected Model Badge
  $('model-name-text').textContent = model.modelName;
  $('model-limit-text').textContent = model.displayLimit;

  // Capacity numbers
  $('token-active-num').textContent = formatCompactNum(totalTokens);
  $('token-limit-num').textContent = model.displayLimit;

  const pct = Math.min(100, (totalTokens / currentLimit) * 100);
  $('token-pct-pill').textContent = `${pct.toFixed(1)}%`;

  const remaining = Math.max(0, currentLimit - totalTokens);
  $('token-remain-text').textContent = `${formatCompactNum(remaining)} remaining`;

  // Dual-segmented bar
  const cachedPct = Math.min((cacheTokens / currentLimit) * 100, 100);
  const freshPct = Math.min((freshTokens / currentLimit) * 100, 100 - cachedPct);
  $('bar-cached').style.width = `${cachedPct.toFixed(2)}%`;
  $('bar-fresh').style.width = `${freshPct.toFixed(2)}%`;

  // Legend values
  $('stat-cached-val').textContent = formatCompactNum(cacheTokens);
  $('stat-fresh-val').textContent = formatCompactNum(freshTokens);
  $('stat-output-val').textContent = formatCompactNum(outputTokens);

  // Health dot
  const dot = $('health-dot');
  if (pct > 90) dot.className = 'health-dot critical';
  else if (pct > 75) dot.className = 'health-dot warning';
  else dot.className = 'health-dot nominal';
}

function renderSparkChart(data) {
  const recentTurns = data.recentTurns || [];
  const container = $('sparkbars-container');
  container.innerHTML = '';

  if (recentTurns.length === 0) {
    container.innerHTML = '<span class="empty-state">No turn telemetry yet.</span>';
    return;
  }

  $('spark-oldest-label').textContent = `Step ${recentTurns[0].stepIndex}`;
  $('spark-latest-label').textContent = `Step ${recentTurns[recentTurns.length - 1].stepIndex}`;

  // Find max input delta across recent turns for proportional scaling
  const maxDelta = Math.max(1000, ...recentTurns.map(t => t.inputTokens || 0));

  recentTurns.forEach((turn, idx) => {
    const bar = document.createElement('div');
    const inputTok = turn.inputTokens || 0;

    let severityClass = '';
    if (inputTok > 25000) severityClass = 'critical';
    else if (inputTok > 10000) severityClass = 'elevated';

    const isSelected = (selectedTurnIndex === idx);
    bar.className = `spark-turn-bar ${severityClass} ${isSelected ? 'selected' : ''}`;

    const heightPct = Math.max(10, Math.min(100, (inputTok / maxDelta) * 100));
    bar.style.height = `${heightPct}%`;

    // On hover: update readout directly in the graph header (NO tooltip!)
    bar.addEventListener('mouseenter', () => {
      hoveredTurnIndex = idx;
      updateGraphHeaderReadout(turn);
    });

    bar.addEventListener('mouseleave', () => {
      hoveredTurnIndex = null;
      if (selectedTurnIndex !== null && recentTurns[selectedTurnIndex]) {
        updateGraphHeaderReadout(recentTurns[selectedTurnIndex]);
      } else {
        updateGraphHeaderReadout(recentTurns[recentTurns.length - 1]);
      }
    });

    // On click: select turn and open the Step Inspector Drawer
    bar.addEventListener('click', () => {
      if (selectedTurnIndex === idx) {
        selectedTurnIndex = null;
        $('step-inspector').hidden = true;
        updateGraphHeaderReadout(recentTurns[recentTurns.length - 1]);
      } else {
        selectedTurnIndex = idx;
        openStepInspector(turn);
        updateGraphHeaderReadout(turn);
      }
      renderSparkChart(data); // re-render to update selected ring
    });

    container.appendChild(bar);
  });

  // Default header readout to selected turn or latest turn
  const activeTurn = (selectedTurnIndex !== null && recentTurns[selectedTurnIndex])
    ? recentTurns[selectedTurnIndex]
    : recentTurns[recentTurns.length - 1];
  updateGraphHeaderReadout(activeTurn);
}

function updateGraphHeaderReadout(turn) {
  if (!turn) return;
  $('readout-step').textContent = `Step ${turn.stepIndex}`;
  $('readout-tokens').textContent = `${formatCompactNum(turn.inputTokens)} in, ${formatCompactNum(turn.outputTokens)} out`;
}

function openStepInspector(turn) {
  const box = $('step-inspector');
  box.hidden = false;
  $('inspector-title').textContent = `Step ${turn.stepIndex} Payload Breakdown`;
  $('insp-input').textContent = formatNum(turn.inputTokens);
  $('insp-output').textContent = formatNum(turn.outputTokens);
  $('insp-cache').textContent = formatNum(turn.cacheReadTokens);

  const itemsList = $('inspector-items');
  itemsList.innerHTML = '';

  const items = turn.items || [];
  if (items.length === 0) {
    itemsList.innerHTML = '<span class="empty-state">No tool outputs during this step (conversational turn).</span>';
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'insp-item-row';
    row.innerHTML = `
      <div class="insp-item-left">
        <span class="tool-chip">${item.tool}</span>
        <span class="insp-file-name" title="${item.target}">${item.fileName}</span>
      </div>
      <span class="insp-item-tokens">+${formatNum(item.estTokens)} tok</span>
    `;
    itemsList.appendChild(row);
  });
}

$('btn-close-inspector').addEventListener('click', () => {
  selectedTurnIndex = null;
  $('step-inspector').hidden = true;
  if (lastData) renderSparkChart(lastData);
});

function renderAttributionDrawers(data) {
  const cats = data.categorySummary || {};
  const latest = data.latest || {};
  const warmth = data.cacheWarmth || {};

  // Helper to populate drawer
  const setupDrawer = (catKey, hintId, listId, emptyMsg) => {
    const cat = cats[catKey] || { count: 0, estTokens: 0, topItems: [] };
    const hintEl = $(hintId);
    const listEl = $(listId);

    // Show main takeaway in the dropdown hint BEFORE expanding
    hintEl.textContent = `${cat.count} ${catKey === 'terminal' ? 'calls' : 'files'} • ${formatCompactNum(cat.estTokens)} tok`;

    // Populate itemized list inside drawer
    listEl.innerHTML = '';
    if (cat.topItems.length === 0) {
      listEl.innerHTML = `<li class="empty-state">${emptyMsg}</li>`;
    } else {
      cat.topItems.forEach(item => {
        const li = document.createElement('li');
        li.className = 'file-row';
        li.innerHTML = `
          <span class="file-name-text" title="${item.name}">${item.name}</span>
          <span class="file-tok">${formatNum(item.tokens)} tok</span>
        `;
        listEl.appendChild(li);
      });
    }
  };

  // 1. Skills
  setupDrawer('skills', 'hint-skills', 'list-skills', 'No skills loaded.');

  // 2. Code Files
  setupDrawer('code', 'hint-code', 'list-code', 'No code files read or edited yet.');

  // 3. Markdown & Docs
  setupDrawer('docs', 'hint-docs', 'list-docs', 'No documentation files accessed.');

  // 4. Terminal & Command Outputs
  setupDrawer('terminal', 'hint-terminal', 'list-terminal', 'No terminal commands executed.');

  // 5. Cache Lifecycle & History
  const cachedTokens = latest.cacheReadTokens || 0;
  const warmthStatus = warmth.status || 'HOT';
  $('hint-history').textContent = `${formatCompactNum(cachedTokens)} tok • ${warmthStatus === 'HOT' ? '🔥 Hot' : warmthStatus === 'COOLING' ? '⏳ Cooling' : '❄️ Cold'}`;

  const totalPrompt = cachedTokens + (latest.inputTokens || 0);
  const hitRate = totalPrompt > 0 ? ((cachedTokens / totalPrompt) * 100).toFixed(1) : '0.0';
  $('hist-hit-rate').textContent = `${hitRate}%`;
  $('hist-cached-tok').textContent = formatNum(cachedTokens);

  const elapsed = warmth.elapsedSec || 0;
  $('hist-elapsed-time').textContent = elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`;
  $('hist-warmth-window').textContent = elapsed < 300 ? `~${Math.ceil((300 - elapsed) / 60)}m left` : 'Evicted';
}

function renderAgentTree(data) {
  const container = $('agent-tree-container');
  container.innerHTML = '';

  const latest = data.latest || {};
  const subagents = data.subagents || [];

  // 1. Main Agent (Root)
  const rootNode = document.createElement('div');
  rootNode.className = 'tree-node';
  const latestTool = latest.toolCalls?.[0]?.name ? `${latest.toolCalls[0].name}` : 'Autonomous Loop';
  rootNode.innerHTML = `
    <div class="node-header">
      <div class="node-left">
        <span class="node-name">Main Agent</span>
        <span class="node-badge">Root Orchestrator</span>
      </div>
      <span class="node-status running">🟢 RUNNING</span>
    </div>
    <div class="node-active-row">
      <span class="node-tool-chip" title="Active tool execution">Step ${latest.stepIndex || 0} • ${latestTool}</span>
      <span class="agent-tok-num">${formatCompactNum(latest.totalContextTokens || 0)} tok</span>
    </div>
  `;
  container.appendChild(rootNode);

  // 2. Child Subagents
  subagents.forEach(sub => {
    const childNode = document.createElement('div');
    childNode.className = 'tree-node is-child';
    childNode.innerHTML = `
      <div class="node-header">
        <div class="node-left">
          <span class="node-name">${sub.agentName}</span>
          <span class="node-badge">Subagent</span>
        </div>
        <span class="node-status ${sub.isRunning ? 'running' : 'idle'}">
          ${sub.isRunning ? '🟢 RUNNING' : '⚪ IDLE'}
        </span>
      </div>
      <div class="node-active-row">
        <span class="node-tool-chip" title="Current action">${sub.latestTool || 'Waiting'}</span>
        <span class="agent-tok-num">${formatCompactNum(sub.totalContextTokens)} tok</span>
      </div>
    `;
    container.appendChild(childNode);
  });
}

// ===========================================================================
// Refresh & Event Handlers
// ===========================================================================
async function refresh() {
  try {
    const convId = sidecar?.conversationId || null;
    const data = await callApi('/api/context', {
      conversationId: convId,
    });
    updateUi(data);
  } catch (err) {
    console.error('Failed to refresh context metrics:', err);
  }
}

function setupAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const enabled = $('toggle-autorefresh').checked;
  if (enabled) {
    refreshTimer = setInterval(refresh, 3000);
  }
}

// Manual refresh & auto-refresh toggle
$('btn-sync').addEventListener('click', () => refresh());
$('toggle-autorefresh').addEventListener('change', () => setupAutoRefresh());

// Initial Boot
refresh();
setupAutoRefresh();
