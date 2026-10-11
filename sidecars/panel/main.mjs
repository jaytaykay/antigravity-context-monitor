// Backend for Context Monitor UI extension.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(dirname(HERE));
const APP_DATA_DIR = process.env.ANTIGRAVITY_APP_DATA_DIR || join(homedir(), '.gemini', 'antigravity');
const BRAIN_DIR = join(APP_DATA_DIR, 'brain');
const DB_PATH = join(APP_DATA_DIR, 'conversation_summaries.db');
const STATE_PBTXT_PATH = join(APP_DATA_DIR, 'antigravity_state.pbtxt');

const readLocal = (name) => readFileSync(join(HERE, name), 'utf8');

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------
function getDb() {
  if (!existsSync(DB_PATH)) return null;
  try {
    return new DatabaseSync(DB_PATH, { readOnly: true });
  } catch (err) {
    console.error('Error opening conversation_summaries.db:', err);
    return null;
  }
}

function getConversationMetadata(convId) {
  const db = getDb();
  if (!db || !convId) return null;
  try {
    const row = db.prepare(
      'SELECT conversation_id, title, agent_name, parent_conversation_id, nesting_depth, status, not_fully_idle, killed FROM conversation_summaries WHERE conversation_id = ?'
    ).get(convId);
    return row || null;
  } catch (err) {
    console.error('Error fetching conversation metadata:', err);
    return null;
  }
}

function getSubagents(parentConvId) {
  const db = getDb();
  if (!db || !parentConvId) return [];
  try {
    const rows = db.prepare(
      'SELECT conversation_id, agent_name, title, status, last_modified_time, not_fully_idle, killed FROM conversation_summaries WHERE parent_conversation_id = ? ORDER BY last_modified_time DESC'
    ).all(parentConvId);
    return rows || [];
  } catch (err) {
    console.error('Error fetching subagents:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Auto-detect Model & Context Window Limits
// ---------------------------------------------------------------------------
function detectActiveModel(events) {
  let detectedName = 'Gemini 3.8 Flash';
  let maxTokens = 1_000_000;
  let detected = false;

  // 1. Scan transcript events in reverse for USER_SETTINGS_CHANGE or model references
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const content = ev.content || '';
    if (content.includes('Model Selection') || content.includes('<USER_SETTINGS_CHANGE>')) {
      if (/pro/i.test(content)) {
        detectedName = 'Gemini Pro';
        maxTokens = 2_000_000;
        detected = true;
        break;
      } else if (/flash/i.test(content)) {
        detectedName = 'Gemini 3.8 Flash';
        maxTokens = 1_000_000;
        detected = true;
        break;
      }
    }
  }

  // 2. Check general content matches if not yet detected
  if (!detected) {
    for (let i = events.length - 1; i >= 0; i--) {
      const content = events[i].content || '';
      if (/Gemini\s+.*Pro/i.test(content)) {
        detectedName = 'Gemini Pro';
        maxTokens = 2_000_000;
        detected = true;
        break;
      } else if (/Gemini\s+.*Flash/i.test(content)) {
        detectedName = 'Gemini 3.8 Flash';
        maxTokens = 1_000_000;
        detected = true;
        break;
      }
    }
  }

  return {
    modelName: detectedName,
    maxTokens,
    detected,
    displayLimit: maxTokens >= 2_000_000 ? '2.0M' : '1.0M',
  };
}

// ---------------------------------------------------------------------------
// Transcript parser & telemetry engine
// ---------------------------------------------------------------------------
function findLatestTranscript() {
  if (!existsSync(BRAIN_DIR)) return null;
  try {
    const entries = readdirSync(BRAIN_DIR, { withFileTypes: true });
    let latestPath = null;
    let latestTime = 0;
    let latestId = null;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const candidate = join(BRAIN_DIR, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
        if (existsSync(candidate)) {
          const stats = statSync(candidate);
          if (stats.mtimeMs > latestTime) {
            latestTime = stats.mtimeMs;
            latestPath = candidate;
            latestId = entry.name;
          }
        }
      }
    }
    return latestPath ? { path: latestPath, conversationId: latestId } : null;
  } catch (err) {
    console.error('Error finding latest transcript:', err);
    return null;
  }
}

function parseTranscript(transcriptPath) {
  if (!existsSync(transcriptPath)) return { found: false };
  try {
    const content = readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n');
    const events = [];
    const plannerSteps = [];
    let cumulativeOutputTokens = 0;
    let cumulativeInputTokens = 0;
    let totalEvents = 0;

    // Category aggregators across whole conversation
    const breakdown = {
      skills: { label: 'Skills & Instructions', count: 0, estTokens: 0, files: new Map() },
      code: { label: 'Code Files (Read/Edited)', count: 0, estTokens: 0, files: new Map() },
      docs: { label: 'Markdown & Docs', count: 0, estTokens: 0, files: new Map() },
      terminal: { label: 'Terminal & Command Output', count: 0, estTokens: 0, files: new Map() },
      other: { label: 'Other Tool Executions', count: 0, estTokens: 0, files: new Map() },
    };

    for (const line of lines) {
      if (!line.trim()) continue;
      totalEvents++;
      try {
        const data = JSON.parse(line);
        events.push(data);
        if (data.type === 'PLANNER_RESPONSE' && data.input_tokens !== undefined) {
          cumulativeOutputTokens += (data.output_tokens || 0);
          cumulativeInputTokens += (data.input_tokens || 0);
          plannerSteps.push({
            stepIndex: data.step_index,
            inputTokens: data.input_tokens || 0,
            cacheReadTokens: data.cache_read_tokens || 0,
            outputTokens: data.output_tokens || 0,
            totalContextTokens: (data.input_tokens || 0) + (data.cache_read_tokens || 0),
            createdAt: data.created_at,
            toolCalls: data.tool_calls || [],
          });
        }
      } catch {
        // Skip malformed line
      }
    }

    const latestPlanner = plannerSteps.length > 0 ? plannerSteps[plannerSteps.length - 1] : null;

    // Detect model and limits
    const modelInfo = detectActiveModel(events);

    // Build per-turn breakdown & correlate with tool results
    const turnBreakdowns = [];

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'PLANNER_RESPONSE') {
        const turn = {
          stepIndex: ev.step_index,
          inputTokens: ev.input_tokens || 0,
          outputTokens: ev.output_tokens || 0,
          cacheReadTokens: ev.cache_read_tokens || 0,
          totalContextTokens: (ev.input_tokens || 0) + (ev.cache_read_tokens || 0),
          createdAt: ev.created_at,
          categories: { skills: 0, code: 0, docs: 0, terminal: 0, other: 0 },
          items: [],
          primaryAction: 'Thinking & Planning',
        };

        if (ev.tool_calls && ev.tool_calls.length > 0) {
          for (const call of ev.tool_calls) {
            const nextEv = events[i + 1];
            let bytes = 0;
            let preview = '';
            if (nextEv && nextEv.type === 'GENERIC' && nextEv.source === 'MODEL' && nextEv.content) {
              bytes = nextEv.content.length;
              preview = nextEv.content.slice(0, 120).replace(/[\r\n]+/g, ' ');
            }
            const estTokens = Math.round(bytes / 3.8);

            const rawTarget = call.args?.AbsolutePath || call.args?.TargetFile || call.args?.CommandLine || '';
            const target = String(rawTarget).replace(/^["']|["']$/g, '').trim();
            const cleanPath = target.toLowerCase();
            let cat = 'other';

            if (call.name === 'run_command') {
              cat = 'terminal';
            } else if (cleanPath.includes('skill.md') || cleanPath.includes('/skills/') || cleanPath.includes('\\skills\\')) {
              cat = 'skills';
            } else if (cleanPath.endsWith('.md') || cleanPath.endsWith('.txt') || cleanPath.endsWith('.rst')) {
              cat = 'docs';
            } else if (cleanPath.match(/\.(js|mjs|cjs|ts|tsx|jsx|json|css|html|py|rs|go|cpp|c|sh|cmd|ps1)$/i)) {
              cat = 'code';
            }

            const fileName = target.split(/[/\\]/).pop() || call.name;

            // Global aggregators
            breakdown[cat].count++;
            breakdown[cat].estTokens += estTokens;
            const prevTok = breakdown[cat].files.get(fileName) || 0;
            breakdown[cat].files.set(fileName, prevTok + estTokens);

            // Turn level
            turn.categories[cat] += estTokens;
            turn.items.push({
              tool: call.name,
              category: cat,
              fileName,
              target,
              estTokens,
              bytes,
              preview,
              actionSummary: call.args?.toolSummary || call.args?.toolAction || call.name,
            });
          }

          if (turn.items.length > 0) {
            turn.primaryAction = `${turn.items[0].tool}: ${turn.items[0].fileName}`;
          }
        }

        turnBreakdowns.push(turn);
      }
    }

    // Format category summary with top files
    const categorySummary = {};
    for (const [k, v] of Object.entries(breakdown)) {
      const topItems = Array.from(v.files.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, tokens]) => ({ name, tokens }));

      categorySummary[k] = {
        label: v.label,
        count: v.count,
        estTokens: v.estTokens,
        topItems,
      };
    }

    // Last 16 turns for the rich interactive sparkline graph
    const recentTurns = turnBreakdowns.slice(-16);

    return {
      found: true,
      model: modelInfo,
      latest: latestPlanner,
      recentTurns,
      categorySummary,
      session: {
        totalTurns: plannerSteps.length,
        cumulativeOutputTokens,
        cumulativeInputTokens,
        totalEvents,
      },
    };
  } catch (err) {
    console.error(`Error parsing transcript ${transcriptPath}:`, err);
    return { found: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Context handler
// ---------------------------------------------------------------------------
function handleContext(data) {
  const reqConvId = data?.conversationId;
  const targetConvId = data?.targetId || reqConvId;
  let activeConvId = targetConvId;
  let targetPath = null;

  if (activeConvId) {
    const p = join(BRAIN_DIR, activeConvId, '.system_generated', 'logs', 'transcript.jsonl');
    if (existsSync(p)) {
      targetPath = p;
    }
  }

  // Fallback to most recently modified conversation
  if (!targetPath) {
    const latest = findLatestTranscript();
    if (latest) {
      targetPath = latest.path;
      activeConvId = latest.conversationId;
    }
  }

  if (!targetPath) {
    return { found: false, message: 'No conversation logs found.' };
  }

  const result = parseTranscript(targetPath);
  result.conversationId = activeConvId;

  // Metadata lookup
  const meta = getConversationMetadata(activeConvId);
  const rootConvId = (meta && meta.parent_conversation_id) ? meta.parent_conversation_id : (reqConvId || activeConvId);
  const rootMeta = rootConvId !== activeConvId ? getConversationMetadata(rootConvId) : meta;

  result.title = rootMeta?.title || meta?.title || 'Active Conversation';
  result.agentName = meta?.agent_name || (meta?.nesting_depth > 0 ? 'Subagent' : 'Main Agent');
  result.isSubagent = Boolean(meta && meta.parent_conversation_id);
  result.parentConversationId = meta?.parent_conversation_id || null;

  // Query subagents of the root conversation for the tree view
  const rawSubagents = getSubagents(rootConvId);
  result.subagents = rawSubagents.map((sub) => {
    const subTranscript = join(BRAIN_DIR, sub.conversation_id, '.system_generated', 'logs', 'transcript.jsonl');
    const subData = parseTranscript(subTranscript);
    const subContextTokens = subData?.latest?.totalContextTokens || 0;

    const isRunning = Boolean(sub.not_fully_idle === 1 || sub.not_fully_idle === 'true' || sub.status === 'CASCADE_RUN_STATUS_RUNNING');
    const latestCall = subData?.latest?.toolCalls?.[0];
    const latestToolDesc = latestCall ? (latestCall.args?.toolSummary || latestCall.name) : 'Idle';

    return {
      conversationId: sub.conversation_id,
      agentName: sub.agent_name || 'Subagent',
      title: sub.title || '',
      status: sub.status || '',
      isRunning,
      latestTool: latestToolDesc,
      totalContextTokens: subContextTokens,
      totalTurns: subData?.session?.totalTurns || 0,
      active: sub.conversation_id === activeConvId,
    };
  });

  result.rootConversationId = rootConvId;

  // Cache Warmth calculation
  const lastTurnTime = result?.latest?.createdAt ? new Date(result.latest.createdAt).getTime() : 0;
  const now = Date.now();
  const elapsedSec = Math.max(0, Math.floor((now - lastTurnTime) / 1000));
  result.cacheWarmth = {
    elapsedSec,
    status: elapsedSec < 300 ? 'HOT' : elapsedSec < 600 ? 'COOLING' : 'COLD',
    remainingWarmSec: Math.max(0, 300 - elapsedSec),
  };

  return result;
}

// ---------------------------------------------------------------------------
// Server Initialization: Sidecar SDK vs Standalone Fallback
// ---------------------------------------------------------------------------
const isSidecarEnv = Boolean(
  process.env.ANTIGRAVITY_LS_ADDRESS &&
  process.env.ANTIGRAVITY_CSRF_TOKEN &&
  process.env.ANTIGRAVITY_SIDECAR_WEB_PORT
);

if (isSidecarEnv) {
  // Production Sidecar execution inside Antigravity
  import('sidecar_sdk').then(({ SidecarApp, Response }) => {
    const app = new SidecarApp();
    app.page('/', () => readLocal('index.html'));
    app.page('/app.js', () => readLocal('app.js'));
    app.api('/styles.css', () => new Response(readLocal('styles.css'), { contentType: 'text/css' }), 'GET');
    app.api('/api/context', handleContext, 'POST');
    app.api('/api/context', handleContext, 'GET');
    app.run();
  });
} else {
  // Standalone Prototype Server for direct browser preview
  const PORT = parseInt(process.env.PORT || '3456', 10);
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    
    // Static routes
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(readLocal('index.html'));
    }
    if (url.pathname === '/app.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      return res.end(readLocal('app.js'));
    }
    if (url.pathname === '/styles.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      return res.end(readLocal('styles.css'));
    }
    if (url.pathname === '/preload.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      return res.end('window.sidecar = { conversationId: null, fetch: (path, opts) => fetch(path, opts) };');
    }

    // API route
    if (url.pathname === '/api/context') {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          let data = {};
          try { data = JSON.parse(body); } catch {}
          const result = handleContext(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        });
      } else {
        const conversationId = url.searchParams.get('conversationId');
        const targetId = url.searchParams.get('targetId');
        const result = handleContext({ conversationId, targetId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      }
      return;
    }

    // Landing Page Routes (GitHub Pages source directory: docs/)
    if (url.pathname === '/landing' || url.pathname === '/landing/' || url.pathname === '/docs' || url.pathname === '/docs/') {
      const p = join(ROOT_DIR, 'docs', 'index.html');
      if (existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(readFileSync(p));
      }
    }
    if (url.pathname === '/landing/styles.css' || url.pathname === '/docs/styles.css') {
      const p = join(ROOT_DIR, 'docs', 'styles.css');
      if (existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
        return res.end(readFileSync(p));
      }
    }
    if (url.pathname === '/landing/script.js' || url.pathname === '/docs/script.js') {
      const p = join(ROOT_DIR, 'docs', 'script.js');
      if (existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        return res.end(readFileSync(p));
      }
    }
    if (url.pathname.startsWith('/docs/assets/') || url.pathname.startsWith('/landing/assets/')) {
      const relPath = url.pathname.replace(/^\/(?:docs|landing)\/assets\//, '');
      const assetPath = join(ROOT_DIR, 'docs', 'assets', relPath);
      if (existsSync(assetPath)) {
        const ext = relPath.split('.').pop()?.toLowerCase();
        const mimeTypes = {
          png: 'image/png',
          svg: 'image/svg+xml',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          webp: 'image/webp'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        return res.end(readFileSync(assetPath));
      }
    }

    // Asset Routes (/assets/...)
    if (url.pathname.startsWith('/assets/')) {
      const relPath = url.pathname.replace(/^\/assets\//, '');
      const assetPath = join(ROOT_DIR, 'assets', relPath);
      if (existsSync(assetPath)) {
        const ext = relPath.split('.').pop()?.toLowerCase();
        const mimeTypes = {
          png: 'image/png',
          svg: 'image/svg+xml',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          webp: 'image/webp'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        return res.end(readFileSync(assetPath));
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Context Monitor Prototype server running at http://127.0.0.1:${PORT}`);
  });
}
