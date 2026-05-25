# XCF Cost per Asset Report — Claude Code Project

This project pulls task data from Asana across all workspace projects, calculates
cost per asset using the Average Minute Rate (XCF) field, generates an interactive
HTML report matching the XCF Capacity Report design, and posts it to Slack daily at
5:00am NZT.

## Project structure

```
cost-per-asset-report/
├── src/
│   ├── index.js      — scheduler + orchestrator (node-cron, 5am NZT)
│   ├── asana.js      — Asana REST API: auto-discovers all projects, calculates cost
│   ├── report.js     — HTML generator: XCF design system, 6-view interactive report
│   └── slack.js      — Slack: summary message + HTML file upload
├── reports/          — generated HTML files (gitignored)
├── .env              — environment variables (gitignored)
├── .env.example      — template
├── CLAUDE.md         — this file
└── package.json
```

## Key design decisions

- **Auto-discovers all workspace projects** on every run — no manual GID list needed
- **Minute-rate model**: cost = estimated_hours × 60 × Average Minute Rate (XCF)
  - Default rate: $2.33 NZD/min ≈ $139.80/hr (global average $150/hr)
  - Per-task rate read from `Average Minute Rate (XCF)` custom field (GID: 1213826548214530)
  - Falls back to `DEFAULT_MINUTE_RATE` env Var if field is empty
- **Pre-calculated cost**: if `XCF: Asset cost` field has a value, that is used directly
- **Start date**: uses Asana native `start_on` field (not a custom field)
- **Hours distribution**: spread evenly across working days between start → due date
  - If no start date: all hours fall on due date

## Confirmed custom field GIDs (workspace 1211868948534506)

| Field | GID | Type |
|---|---|---|
| Estimated time | 1203387567618671 | number (hours) |
| Average Minute Rate (XCF) | 1213826548214530 | number ($/min) |
| Asset count (XCF) | 1212213385632145 | number |
| XCF: Asset cost | 1213828392202051 | number (pre-calc) |