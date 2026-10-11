# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Software engineers and AI developers using Google Antigravity for agentic workflows (multi-turn agent problem solving, long-running background tasks, and parallel subagent swarms).

## Product Purpose

Real-time, non-interruptive context window gauge, bloat profiler, and token telemetry extension docked in the Antigravity auxiliary side pane. It prevents context exhaustion, runaway token burn, and agent defocus during long agentic runs with zero model token consumption.

## Positioning

Unlike CLI commands (like `/context`) that require manual prompt interruptions, or basic token counters that only show a raw number, Context Monitor provides real-time, out-of-band telemetry with deep diagnostic bloat breakdowns (identifying huge tool payloads and file dumps), burn velocity runways, and live multi-agent subagent fleet tracking.

## Operating Context

- Antigravity IDE auxiliary side pane (typically 280px to 450px wide) docked alongside the active chat and code editor.
- Background Node.js sidecar daemon querying local `transcript.jsonl` files and `conversation_summaries.db` out-of-band.
- High-frequency live sessions where agents run multiple consecutive tool calls, file edits, and subagent invocations.

## Capabilities and Constraints

- **Zero Token Overhead:** Queries local disk transcripts out-of-band; zero API calls or model prompt tokens consumed.
- **Context Limits:** Configurable limits (1M Flash preset, 2M Pro preset, custom limits).
- **Bloat Profiling:** Identifies top context consumers (tool outputs, file chunks, prompt overhead, thinking tokens).
- **Runway & Velocity:** Computes burn rate (tokens/turn) and projects turns remaining before context exhaustion or compaction.
- **Multi-Agent Orchestration:** Real-time visibility into child subagents, their execution states, active tools, and per-subagent token usage.
- **Cache Warmth Tracking:** Tracks elapsed time since last model response and visualizes Gemini prompt caching lifecycle (Hot <5m, Cooling <10m, Cold >10m).

## Product Principles

1. **Zero Overhead:** Never consume model tokens or interrupt user prompts to measure context.
2. **Actionable Diagnostics:** Make the invisible visible—tell developers *what* ate their context (large terminal output, huge file read, verbose thinking).
3. **Cockpit Glanceability:** Maximize information density for narrow auxiliary panels; critical health states must be readable at a glance without scrolling.
4. **First-Class Agentic Fleet:** Subagents are not an afterthought; parent and children are treated as an integrated multi-agent system.
