# Context Monitor for Google Antigravity

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5.0-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Antigravity-Plugin-purple.svg)](https://github.com/jaytaykay/antigravity-context-monitor)

A real-time, non-interruptive context window gauge and token telemetry monitor for **Google Antigravity**.

Docked directly in the Antigravity auxiliary side pane, Context Monitor tracks live context consumption, in-graph turn token velocity, payload breakdowns by category (Skills vs Code vs Docs vs Terminal), and multi-agent hierarchy — with **zero prompt interruptions** and **0 model tokens consumed**.

---

## ⚡ Key Features

- **Zero Token Overhead:** Queries local disk transcripts (`transcript.jsonl`) and session SQLite summaries out-of-band; never consumes API tokens or model prompt budget.
- **Auto-Detected Model & Limits:** Automatically detects active model settings (Gemini Flash 1.0M vs Gemini Pro 2.0M) from session telemetry without manual toggles.
- **Interactive Turn Velocity Graph:** 16-step sparkbar chart. Hovering any bar updates the telemetry readout directly in the graph header; clicking inspects tool payloads and file burns.
- **Progressive Payload Attribution:**
  - **Skills & Rules:** `SKILL.md` instructions and tool declarations.
  - **Code Files:** Source files read and edited (`.js`, `.mjs`, `.ts`, `.py`, `.css`, etc.).
  - **Markdown & Plans:** Specs, plans, and documentation (`README.md`, `PRODUCT.md`, etc.).
  - **Terminal & Commands:** Shell commands and compiler/test outputs.
  - **Prompt Cache Lifecycle:** Prompt cache hit rate, elapsed time, and warm window countdown.
- **Agent Fleet Tracking:** Displays the root orchestrator alongside active child subagents, their execution states, current tool executions, and individual context usage.
- **Dual Mode:** Runs embedded as a native Antigravity sidecar extension or standalone as a lightweight browser preview dashboard.

---

## 📋 Prerequisites

- **Google Antigravity IDE**
- **Node.js >= 22.5.0** (uses built-in `node:sqlite` for reading conversation summaries; no external dependencies required)

---

## 🚀 Installation & Setup

### 1. Install as an Antigravity Plugin

Clone the repository into your Antigravity plugins directory:

#### Windows (PowerShell)
```powershell
git clone https://github.com/jaytaykay/antigravity-context-monitor.git "$env:USERPROFILE\.gemini\config\plugins\context-monitor"
```

#### macOS / Linux
```bash
git clone https://github.com/jaytaykay/antigravity-context-monitor.git ~/.gemini/config/plugins/context-monitor
```

> **Note:** If you install while Antigravity is open, restart the app to discover the new plugin directory.

### 2. Using in Antigravity

- **Via Extensions Menu:** Click **⋮ (Extensions)** $\rightarrow$ select **Context Monitor**.
- **Via Chat Pill:** Click [`[Context Monitor]`](sidecar://context-monitor/panel/) in any conversation.
- **Via Slash Command:** Type `/context-monitor` in chat to summon the toggle link.

The panel docks in your auxiliary side pane and updates automatically every 3 seconds as your agent works.

---

## 🖥️ Standalone Browser Preview

You can also run Context Monitor independently in any web browser to inspect local sessions or test the UI:

```bash
git clone https://github.com/jaytaykay/antigravity-context-monitor.git
cd antigravity-context-monitor
npm start
```

Then open [http://127.0.0.1:3456/](http://127.0.0.1:3456/) in your browser.

---

## 📂 Repository Structure

```text
context-monitor/
├── assets/
│   └── logo.svg                 # Plugin logo for Antigravity UI
├── sidecars/
│   └── panel/                   # UI extension sidecar
│       ├── sidecar.json         # Sidecar process & aux pane manifest
│       ├── main.mjs             # Node backend (transcript & SQLite telemetry)
│       ├── index.html           # Monitor panel HTML markup
│       ├── app.js               # Frontend controller & reactive state
│       └── styles.css           # High-density panel styling
├── skills/
│   └── context-monitor/
│       └── SKILL.md             # /context-monitor skill & navigation pill
├── plugin.json                  # Antigravity plugin manifest
├── package.json                 # Node package configuration
├── DESIGN.md                    # Design tokens & UI specifications
├── PRODUCT.md                   # Product architecture & requirements
└── LICENSE                      # MIT License
```

---

## 🧪 Verification & Testing

Verify syntax and script integrity with:

```bash
npm test
```

---

## 📄 License

[MIT](LICENSE) © 2026 jaytaykay
