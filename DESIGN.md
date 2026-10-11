# Design System

<!-- impeccable:design-schema 1 -->

## Visual World

Antigravity Precision Telemetry — an engineering cockpit interface designed for the narrow auxiliary side pane of Google Antigravity. High-density information architecture, surgical typographic rhythm, and restrained dark aesthetics that blend seamlessly with the host IDE.

## Color Strategy

Restrained with Semantic Status Anchors: Deep obsidian background (`#0e1015`), subtle surface elevation (`#161922`), crisp hairline borders (`#262b3a`), and clear semantic indicators for context consumption and agent lifecycle states.

### Tokens

```css
:root {
  /* Surfaces */
  --bg-app: #0c0e14;
  --bg-surface: #141721;
  --bg-surface-elevated: #1b1f2e;
  --bg-surface-subtle: #10131c;
  --border-subtle: #232838;
  --border-strong: #333a50;
  --border-focus: #3b82f6;

  /* Typography */
  --text-primary: #f0f3f8;
  --text-secondary: #9aa4b8;
  --text-muted: #647087;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Semantic Health & Telemetry */
  --status-normal: #10b981;    /* < 50% context */
  --status-warning: #f59e0b;   /* 50% - 75% */
  --status-elevated: #f97316;  /* 75% - 90% */
  --status-critical: #ef4444;  /* > 90% */
  --accent-primary: #3b82f6;   /* Cache / Actions */
  --accent-agent: #8b5cf6;     /* Subagent badge */
  --accent-fresh: #06b6d4;     /* Fresh prompt tokens */
  
  /* Radii & Geometry */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 9999px;
}
```

## Typography & Hierarchy

- **Numbers & Metrics:** Must always declare `font-variant-numeric: tabular-nums;` and use monospace or tabular sans so rolling token numbers never jitter.
- **Headings:** 13px - 14px semi-bold (600), clean tracking (`-0.01em`). Never use decorative kicker/eyebrow headings.
- **Micro-labels:** 11px uppercase/medium with 0.02em letter spacing for metric descriptions.
- **Code & Identifiers:** 11px monospace with muted background chips (`#1a1f2c`).

## Iconography & Affordances

- All icons are inline crisp SVG vectors with 1.5px - 1.75px stroke width. No emoji used as functional icons.
- Interactive controls must have distinct `:hover` and `:active` states with subtle background elevation transitions.

## Form Factor & Density

- Built for the 280px–450px auxiliary side pane.
- Prioritizes glanceability: critical state (Active Tokens, %, Health status, Velocity) visible without vertical scrolling.
