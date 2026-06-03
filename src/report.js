// src/report.js — generates interactive HTML report from cost data

const fs   = require("fs");
const path = require("path");

function fmtNZD(n) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency", currency: "NZD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n || 0);
}

function fmt(n, d = 0) {
  return new Intl.NumberFormat("en-NZ", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(n || 0);
}

function generateHtml(data) {
  const { members, totals, allOverdue, allMissing, byPod, byDeliverable, completedProjects, generatedAt } = data;

  const dateStr = generatedAt.toLocaleDateString("en-NZ", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const globalCPA = totals.totalAssets > 0
    ? fmtNZD(totals.totalCostNZD / totals.totalAssets)
    : "—";

  const membersJson           = JSON.stringify(members);
  const totalsJson            = JSON.stringify(totals);
  const byPodJson             = JSON.stringify(byPod || []);
  const byDelJson             = JSON.stringify(byDeliverable || []);
  const completedProjectsJson = JSON.stringify(completedProjects || []);
  const allMissingJson        = JSON.stringify(allMissing || []);
  const generatedAtJson       = JSON.stringify(generatedAt.toISOString());

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>XCF Cost per Asset — ${dateStr}</title>
<style>
  :root {
    --bg:     #0f1117;
    --bg2:    #1a1d27;
    --bg3:    #22263a;
    --border: #2e3250;
    --text:   #e2e8f0;
    --muted:  #8892b0;
    --accent: #6c63ff;
    --accent2:#00d4aa;
    --warn:   #f59e0b;
    --danger: #ef4444;
    --green:  #22c55e;
    --radius: 10px;
    --font:   'Inter', 'Segoe UI', system-ui, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .header { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 24px 32px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
  .header-title { font-size: 30px; font-weight: 800; color: #fff; letter-spacing: -.5px; line-height: 1.1; }
  .header-date  { font-size: 16px; color: var(--muted); margin-top: 6px; }
  .header-meta .rate    { font-size: 13px; color: var(--muted); text-align:right; }
  .header-meta .gentime { font-size: 12px; color: #4a5270; margin-top: 3px; text-align:right; }

  .tabs { display: flex; gap: 2px; padding: 16px 32px 0; background: var(--bg2); border-bottom: 1px solid var(--border); overflow-x: auto; }
  .tab { padding: 10px 20px; border-radius: var(--radius) var(--radius) 0 0; cursor: pointer; color: var(--muted); font-size: 13px; font-weight: 500; border: 1px solid transparent; border-bottom: none; white-space: nowrap; transition: background .15s, color .15s; }
  .tab:hover { background: var(--bg3); color: var(--text); }
  .tab.active { background: var(--bg); color: #fff; border-color: var(--border); }
  .content { padding: 28px 32px; }
  .view { display: none; }
  .view.active { display: block; }

  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 28px 0 12px; }
  .section-title:first-child { margin-top: 0; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(175px, 1fr)); gap: 14px; margin-bottom: 8px; }
  .kpi { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; }
  .kpi .label { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin-bottom: 8px; }
  .kpi .value { font-size: 26px; font-weight: 700; color: #fff; }
  .kpi .sub   { font-size: 12px; color: var(--muted); margin-top: 4px; }

  .card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 10px 16px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; cursor: pointer; user-select: none; }
  th:hover { color: var(--text); }
  th .sort-arrow { opacity: .4; margin-left: 4px; }
  th.sorted .sort-arrow { opacity: 1; color: var(--accent); }
  td { padding: 10px 16px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg3); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge.red    { background: rgba(239,68,68,.18);  color: #f87171; }
  .badge.yellow { background: rgba(245,158,11,.18); color: #fbbf24; }
  .badge.green  { background: rgba(34,197,94,.18);  color: #4ade80; }
  .bar-wrap { background: var(--bg3); border-radius: 4px; height: 6px; width: 100%; min-width: 60px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .empty { padding: 40px; text-align: center; color: var(--muted); font-size: 13px; }
  input.search { background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 7px 12px; color: var(--text); font-size: 13px; width: 220px; }
  input.search::placeholder { color: var(--muted); }
  input.search:focus { outline: none; border-color: var(--accent); }

  .overview-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 860px) { .overview-cols { grid-template-columns: 1fr; } }

  .hbar-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .hbar-row:last-child { border-bottom: none; }
  .hbar-label { width: 150px; flex-shrink: 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hbar-track { flex: 1; background: var(--bg3); border-radius: 4px; height: 8px; overflow: hidden; }
  .hbar-fill  { height: 100%; border-radius: 4px; }
  .hbar-value { width: 90px; flex-shrink: 0; font-size: 12px; color: var(--muted); text-align: right; }

  .chart-area { height: 220px; display: flex; align-items: flex-end; gap: 6px; padding: 0 8px 24px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
  .bar-col .bar { width: 100%; border-radius: 4px 4px 0 0; position: relative; cursor: default; transition: opacity .15s; }
  .bar-col .bar:hover { opacity: .82; }
  .bar-col .bar-label { font-size: 10px; color: var(--muted); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
  .bar-col .bar-val   { font-size: 10px; color: var(--text); }
  .tooltip { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 12px; white-space: nowrap; pointer-events: none; z-index: 10; display: none; }
  .bar-col .bar:hover .tooltip { display: block; }

  .q-btn { background:var(--bg3); border:1px solid var(--border); border-radius:6px; padding:6px 14px; color:var(--muted); font-size:13px; font-weight:500; cursor:pointer; transition:background .15s,color .15s; }
  .q-btn:hover { background:var(--bg); color:var(--text); }
  .q-btn.active { background:var(--accent); border-color:var(--accent); color:#fff; }

  @media (max-width: 640px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .content  { padding: 16px 14px; }
    .header   { padding: 16px 14px; }
    .header-title { font-size: 22px; }
    .tabs     { padding: 12px 14px 0; }
    .tab      { padding: 8px 12px; font-size: 12px; }
  }
</style>
</head>
<body>

<!-- ── password overlay ── -->
<div id="pw-overlay" style="position:fixed;inset:0;background:#0f1117;display:flex;align-items:center;justify-content:center;z-index:9999">
  <div style="background:#1a1d27;border:1px solid #2e3250;border-radius:14px;padding:40px 36px;width:320px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:6px">XCF Cost per Asset</div>
    <div style="font-size:13px;color:#8892b0;margin-bottom:24px">Enter the password to view this report</div>
    <input id="pw-input" type="password" placeholder="Password" autofocus
      onkeydown="if(event.key==='Enter')checkPw()"
      style="width:100%;padding:10px 14px;background:#0f1117;border:1px solid #2e3250;border-radius:8px;color:#fff;font-size:15px;text-align:center;outline:none;margin-bottom:12px;box-sizing:border-box"/>
    <button onclick="checkPw()"
      style="width:100%;padding:10px;background:#6c63ff;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer">View Report</button>
    <div id="pw-error" style="font-size:12px;color:#f87171;margin-top:10px;display:none">Incorrect password. Please try again.</div>
  </div>
</div>
<script>
(function(){
  if(sessionStorage.getItem('xcf-cpa-auth')==='1'){
    document.getElementById('pw-overlay').style.display='none';
  }
})();
function checkPw(){
  if(document.getElementById('pw-input').value==='Cost'){
    sessionStorage.setItem('xcf-cpa-auth','1');
    document.getElementById('pw-overlay').style.display='none';
  } else {
    document.getElementById('pw-error').style.display='block';
    document.getElementById('pw-input').value='';
  }
}
</script>

<div class="header">
  <div>
    <div class="header-title">XCF Cost per Asset Report</div>
    <div class="header-date">${dateStr}</div>
  </div>
  <div class="header-meta">
    <div class="rate">Rate: $${process.env.DEFAULT_MINUTE_RATE || "2.33"} NZD/min (~$${fmt(parseFloat(process.env.DEFAULT_MINUTE_RATE || "2.33") * 60, 0)}/hr)</div>
    <div style="font-size:12px;color:var(--accent2);margin-top:4px;text-align:right">✔ Completed tasks only</div>
    <div class="gentime">Generated ${generatedAt.toLocaleTimeString("en-NZ")}</div>
  </div>
</div>

<div class="tabs">
  <div class="tab active" onclick="switchTab('overview')">Overview</div>
  <div class="tab" onclick="switchTab('byPerson')">By Person</div>
  <div class="tab" onclick="switchTab('byPod')">By POD</div>
  <div class="tab" onclick="switchTab('tasks')">All Tasks</div>
  <div class="tab" onclick="switchTab('byProject')">By Project</div>
  <div class="tab" onclick="switchTab('missing')">Missing Fields <span id="badge-missing" style="background:rgba(245,158,11,.25);color:#fbbf24;border-radius:10px;padding:1px 6px;font-size:11px;margin-left:4px"></span></div>
  <div class="tab" onclick="switchTab('dateRange')">Date Range</div>
</div>

<div class="content">

<!-- ════════ OVERVIEW ════════ -->
<div id="view-overview" class="view active">
  <div class="section-title">Portfolio Summary</div>
  <div class="kpi-grid" id="kpi-grid"></div>

  <div class="section-title">Cost by Person</div>
  <div class="card">
    <div class="chart-area" id="cost-chart"></div>
  </div>

  <div class="overview-cols">
    <div>
      <div class="section-title">Cost by Asset Type</div>
      <div class="card"><div id="deliverable-bars" style="padding:12px 20px"></div></div>
    </div>
    <div>
      <div class="section-title">Cost by POD Team</div>
      <div class="card"><div id="pod-bars" style="padding:12px 20px"></div></div>
    </div>
  </div>
</div>

<!-- ════════ BY PERSON ════════ -->
<div id="view-byPerson" class="view">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div style="font-size:13px;color:var(--muted)" id="byPerson-count"></div>
    <input class="search" id="byPerson-search" placeholder="Search name..." oninput="filterByPerson()">
  </div>
  <div class="card">
    <table id="byPerson-table">
      <thead><tr>
        <th onclick="sortTable('byPerson',0)">Name <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byPerson',1)">Total Cost <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byPerson',2)">Assets <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byPerson',3)">Cost/Asset <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byPerson',4)">Hours <span class="sort-arrow">↕</span></th>
        <th></th>
      </tr></thead>
      <tbody id="byPerson-body"></tbody>
    </table>
  </div>
</div>

<!-- ════════ BY POD ════════ -->
<div id="view-byPod" class="view">
  <div style="margin-bottom:16px;font-size:13px;color:var(--muted)" id="byPod-count"></div>
  <div class="card">
    <table id="byPod-table">
      <thead><tr>
        <th onclick="sortTable('byPod',0)">POD Team <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byPod',1)">Total Cost <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byPod',2)">Assets <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byPod',3)">Cost/Asset <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byPod',4)">Members <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byPod',5)">Tasks <span class="sort-arrow">↕</span></th>
        <th></th>
      </tr></thead>
      <tbody id="byPod-body"></tbody>
    </table>
  </div>
</div>

<!-- ════════ ALL TASKS ════════ -->
<div id="view-tasks" class="view">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div style="font-size:13px;color:var(--muted)" id="tasks-count"></div>
    <input class="search" id="tasks-search" placeholder="Search task or person..." oninput="filterTasks()">
  </div>
  <div class="card">
    <table id="tasks-table">
      <thead><tr>
        <th onclick="sortTable('tasks',0)">Task <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('tasks',1)">Assignee <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('tasks',2)">Project <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('tasks',3)">Due <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('tasks',4)">Hours <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('tasks',5)">Assets <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('tasks',6)">Cost <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('tasks',7)">Cost/Asset <span class="sort-arrow">↕</span></th>
      </tr></thead>
      <tbody id="tasks-body"></tbody>
    </table>
  </div>
</div>

<!-- ════════ BY PROJECT ════════ -->
<div id="view-byProject" class="view">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div style="font-size:13px;color:var(--muted)" id="byProject-count"></div>
    <input class="search" id="byProject-search" placeholder="Search project..." oninput="filterByProject()">
  </div>
  <div class="card">
    <table id="byProject-table">
      <thead><tr>
        <th onclick="sortTable('byProject',0)">Project <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byProject',1)">Completed <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byProject',2)">Total Cost <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byProject',3)">Assets <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byProject',4)">Cost/Asset <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byProject',5)">Hours <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('byProject',6)">Team <span class="sort-arrow">↕</span></th>
        <th></th>
      </tr></thead>
      <tbody id="byProject-body"></tbody>
    </table>
  </div>
</div>

<!-- ════════ MISSING FIELDS ════════ -->
<div id="view-missing" class="view">

  <!-- Formula explanation -->
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:18px 22px;margin-bottom:22px">
    <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px">💡 How cost is calculated</div>
    <div style="font-size:13px;color:var(--text);margin-bottom:8px">
      For each task, cost is taken from whichever field is available — in priority order:
    </div>
    <div style="background:var(--bg3);border-radius:8px;padding:14px 18px;font-family:monospace;font-size:13px;color:var(--accent2);margin-bottom:12px">
      Cost = <span style="color:#fbbf24">XCF: Asset cost</span> &nbsp;(pre-calculated field)<br>
      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;OR&nbsp; <span style="color:#fbbf24">Estimated time (mins)</span> × <span style="color:#fbbf24">Average Minute Rate (XCF)</span><br>
      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;OR&nbsp; <span style="color:#fbbf24">Estimated time (mins)</span> × $2.33 NZD/min <span style="color:var(--muted)">(default rate)</span>
    </div>
    <div style="font-size:12px;color:var(--warn)">
      ⚠️ Tasks below have <strong>neither</strong> field set — they contribute <strong>$0</strong> to the report and are skewing your totals downward.
      Fix them in Asana by adding either <em>Estimated time</em> or the pre-calculated <em>XCF: Asset cost</em> value.
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div style="font-size:13px;color:var(--muted)" id="missing-count"></div>
    <input class="search" id="missing-search" placeholder="Search task or person..." oninput="filterMissing()">
  </div>
  <div class="card">
    <table id="missing-table">
      <thead><tr>
        <th onclick="sortTable('missing',0)">Task <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('missing',1)">Assignee <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('missing',2)">Project <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('missing',3)">POD <span class="sort-arrow">↕</span></th>
        <th onclick="sortTable('missing',4)">Completed <span class="sort-arrow">↕</span></th>
        <th>Fix needed</th>
      </tr></thead>
      <tbody id="missing-body"></tbody>
    </table>
  </div>
</div>

<!-- ════════ DATE RANGE ════════ -->
<div id="view-dateRange" class="view">
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:18px 22px;margin-bottom:22px">
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px">Quarter</div>
        <div style="display:flex;gap:6px">
          <button class="q-btn" id="qbtn-1" onclick="setQuarter(1)">Q1</button>
          <button class="q-btn" id="qbtn-2" onclick="setQuarter(2)">Q2</button>
          <button class="q-btn" id="qbtn-3" onclick="setQuarter(3)">Q3</button>
          <button class="q-btn" id="qbtn-4" onclick="setQuarter(4)">Q4</button>
        </div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px">From</div>
        <input type="date" id="dr-from" oninput="clearQBtns();applyDateRange()" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text);font-size:13px">
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px">To</div>
        <input type="date" id="dr-to" oninput="clearQBtns();applyDateRange()" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text);font-size:13px">
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px">POD Team</div>
        <select id="dr-pod" onchange="applyDateRange()" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text);font-size:13px;min-width:160px">
          <option value="">All PODs</option>
        </select>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px">Person</div>
        <select id="dr-person" onchange="applyDateRange()" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text);font-size:13px;min-width:160px">
          <option value="">All People</option>
        </select>
      </div>
    </div>
  </div>
  <div class="kpi-grid" id="dr-kpis" style="margin-bottom:22px"></div>
  <div style="font-size:13px;color:var(--muted);margin-bottom:12px" id="dr-count"></div>
  <div class="card">
    <table id="dr-table">
      <thead><tr>
        <th>Task</th>
        <th>Person</th>
        <th>POD</th>
        <th>Project</th>
        <th>Due</th>
        <th>Hours</th>
        <th>Assets</th>
        <th>Cost</th>
        <th>Cost/Asset</th>
      </tr></thead>
      <tbody id="dr-body"></tbody>
    </table>
  </div>
</div>

</div><!-- /content -->

<script>
const MEMBERS             = ${membersJson};
const TOTALS              = ${totalsJson};
const BY_POD              = ${byPodJson};
const BY_DEL              = ${byDelJson};
const COMPLETED_PROJECTS  = ${completedProjectsJson};
const ALL_MISSING         = ${allMissingJson};
const GENERATED_AT        = new Date(${generatedAtJson});

// ── helpers ──────────────────────────────────────────────────
const fmtNZD = (n) => new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD',minimumFractionDigits:0,maximumFractionDigits:0}).format(n||0);
const fmt    = (n,d=0) => new Intl.NumberFormat('en-NZ',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n||0);
const esc    = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const asanaLink = (gid) => gid ? \`https://app.asana.com/0/0/\${gid}/f\` : '#';

function getNumField(task, gid) {
  const f = (task.custom_fields||[]).find(f=>f.gid===gid);
  return f ? (f.number_value ?? null) : null;
}
const FIELD_ESTIMATED_TIME = '1203387567618671'; // minutes
const FIELD_MINUTE_RATE    = '1213826548214530';
const FIELD_ASSET_COUNT    = '1212213385632145';
const FIELD_ASSET_COST     = '1213828392202051';
const DEFAULT_RATE         = 2.33;

function taskCostCalc(task) {
  const pre = getNumField(task, FIELD_ASSET_COST);
  if (pre != null && pre > 0) return pre;
  const mins = getNumField(task, FIELD_ESTIMATED_TIME) || 0; // minutes
  const rate = getNumField(task, FIELD_MINUTE_RATE) ?? DEFAULT_RATE;
  return mins * rate; // minutes × $/min = $
}
function taskHours(task) {
  const mins = getNumField(task, FIELD_ESTIMATED_TIME) || 0;
  return mins / 60; // convert to hours for display
}
function taskAssets(task) { return getNumField(task, FIELD_ASSET_COUNT) || 1; }
function getEnumField(task, gid) {
  const f = (task.custom_fields||[]).find(f=>f.gid===gid);
  return f ? (f.enum_value?.name ?? null) : null;
}
const FIELD_PODS = '1211165589636938';

const PALETTE = ['#6c63ff','#00d4aa','#f59e0b','#ef4444','#3b82f6','#ec4899','#8b5cf6','#22c55e','#f97316','#06b6d4'];

// ── tabs ──────────────────────────────────────────────────────
const TAB_IDS = ['overview','byPerson','byPod','tasks','byProject','missing','dateRange'];
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', TAB_IDS[i]===name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id==='view-'+name));
}

// ── sort ──────────────────────────────────────────────────────
const sortState = {};
function sortTable(id, col) {
  const s = sortState[id] || {col:1,dir:'desc'};
  s.dir = s.col===col ? (s.dir==='asc'?'desc':'asc') : 'desc';
  s.col = col;
  sortState[id] = s;
  if (id==='byPerson')  { filterByPerson();  return; }
  if (id==='tasks')     { filterTasks();     return; }
  if (id==='byPod')     { renderByPod();     return; }
  if (id==='byProject') { filterByProject(); return; }
  if (id==='missing')   { filterMissing();   return; }
}
function updateSortHeaders(tableId, col, dir) {
  document.querySelectorAll('#'+tableId+' th').forEach((th,i) => {
    th.classList.toggle('sorted', i===col);
    const arr = th.querySelector('.sort-arrow');
    if (arr) arr.textContent = i===col ? (dir==='asc'?'↑':'↓') : '↕';
  });
}

// ── OVERVIEW ─────────────────────────────────────────────────
function renderOverview() {
  const cpa = TOTALS.totalAssets>0 ? fmtNZD(TOTALS.totalCostNZD/TOTALS.totalAssets) : '—';
  const kpis = [
    { label:'Total Delivered Cost', value:fmtNZD(TOTALS.totalCostNZD), sub:fmt(TOTALS.totalHours,0)+'h · '+fmt(TOTALS.totalAssets)+' assets' },
    { label:'Avg Cost per Asset',   value:cpa,                          sub:'across all completed work' },
    { label:'Total Assets',         value:fmt(TOTALS.totalAssets),      sub:fmt(TOTALS.totalHours,0)+'h of work' },
    { label:'Total Hours',          value:fmt(TOTALS.totalHours,0)+'h', sub:'estimated time' },
    { label:'Team Members',         value:TOTALS.memberCount,            sub:TOTALS.projectCount+' projects' },
  ];
  document.getElementById('kpi-grid').innerHTML = kpis.map(k=>\`
    <div class="kpi">
      <div class="label">\${esc(k.label)}</div>
      <div class="value" style="\${k.warn&&k.value>0?'color:var(--warn)':''}">\${esc(String(k.value))}</div>
      <div class="sub">\${esc(k.sub||'')}</div>
    </div>\`).join('');

  // Vertical bar chart — top 10 by person
  const top = [...MEMBERS].sort((a,b)=>b.totalCostNZD-a.totalCostNZD).slice(0,10);
  const maxC = top[0]?.totalCostNZD || 1;
  document.getElementById('cost-chart').innerHTML = top.map((m,i)=>{
    const pct = Math.round((m.totalCostNZD/maxC)*100);
    const col = PALETTE[i%PALETTE.length];
    const cpa = m.totalAssets>0 ? fmtNZD(m.totalCostNZD/m.totalAssets) : '—';
    return \`<div class="bar-col">
      <div class="bar-val">\${fmtNZD(m.totalCostNZD)}</div>
      <div class="bar" style="height:\${Math.max(pct*1.9,4)}px;background:\${col}">
        <div class="tooltip">\${esc(m.name)}<br>\${fmtNZD(m.totalCostNZD)}<br>\${fmt(m.totalAssets)} assets · \${cpa}/asset</div>
      </div>
      <div class="bar-label">\${esc(m.name.split(' ')[0])}</div>
    </div>\`;
  }).join('');

  // Horizontal bars — asset types (click any row to drill down)
  const maxD = BY_DEL[0]?.totalCostNZD || 1;
  document.getElementById('deliverable-bars').innerHTML = BY_DEL.slice(0,15).map((d,i) => {
    const safeId = 'del_' + d.name.replace(/[^a-zA-Z0-9]/g,'_');
    const topTasks = (d.tasks||[]).slice().sort((a,b)=>b.cost-a.cost).slice(0,20);
    const taskRows = topTasks.map(t=>\`
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px">
          <a href="\${asanaLink(t.gid)}" target="_blank" style="color:var(--text)">\${esc(t.name)}</a>
        </div>
        <div style="font-size:11px;color:var(--muted);white-space:nowrap;padding-right:8px">\${esc(t.memberName||'')}</div>
        <div style="font-size:11px;color:var(--accent2);white-space:nowrap">\${fmtNZD(t.cost)}</div>
      </div>\`).join('');
    return \`
    <div>
      <div class="hbar-row" onclick="toggleDel('\${safeId}')" style="cursor:pointer" title="Click to expand">
        <div class="hbar-label" title="\${esc(d.name)}">\${esc(d.name)}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:\${Math.round(d.totalCostNZD/maxD*100)}%;background:\${PALETTE[i%PALETTE.length]}"></div></div>
        <div class="hbar-value">\${fmtNZD(d.totalCostNZD)}</div>
        <div style="width:16px;flex-shrink:0;font-size:10px;color:var(--muted);text-align:right" id="\${safeId}_arrow">▶</div>
      </div>
      <div id="\${safeId}" style="display:none;padding:8px 4px 4px;margin-bottom:4px">
        \${taskRows || '<div style="font-size:11px;color:var(--muted);padding:4px 0">No tasks</div>'}
        \${(d.tasks||[]).length > 20 ? \`<div style="font-size:11px;color:var(--muted);margin-top:4px">+ \${(d.tasks||[]).length-20} more — use Date Range tab to filter</div>\` : ''}
      </div>
    </div>\`;
  }).join('') || '<div class="empty">No data</div>';

  // Horizontal bars — POD teams
  const maxP = BY_POD[0]?.totalCostNZD || 1;
  document.getElementById('pod-bars').innerHTML = BY_POD.map((p,i)=>\`
    <div class="hbar-row">
      <div class="hbar-label" title="\${esc(p.name)}">\${esc(p.name)}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:\${Math.round(p.totalCostNZD/maxP*100)}%;background:\${PALETTE[i%PALETTE.length]}"></div></div>
      <div class="hbar-value">\${fmtNZD(p.totalCostNZD)}</div>
    </div>\`).join('') || '<div class="empty">No data</div>';
}

function toggleDel(id) {
  const el  = document.getElementById(id);
  const arr = document.getElementById(id+'_arrow');
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display  = open ? 'none' : 'block';
  if (arr) arr.textContent = open ? '▶' : '▼';
}

// ── BY PERSON ─────────────────────────────────────────────────
function renderByPerson() {
  sortState['byPerson'] = sortState['byPerson'] || {col:1,dir:'desc'};
  filterByPerson();
}
function filterByPerson() {
  const q = (document.getElementById('byPerson-search')?.value||'').toLowerCase();
  const filtered = MEMBERS.filter(m=>m.name.toLowerCase().includes(q));
  const {col,dir} = sortState['byPerson']||{col:1,dir:'desc'};
  const getVal = (m,c) => [m.name,m.totalCostNZD,m.totalAssets,m.totalAssets>0?m.totalCostNZD/m.totalAssets:0,m.totalHours][c];
  const sorted = [...filtered].sort((a,b)=>{const av=getVal(a,col),bv=getVal(b,col);return dir==='asc'?(av>bv?1:av<bv?-1:0):(av<bv?1:av>bv?-1:0);});
  document.getElementById('byPerson-count').textContent = sorted.length+' member'+(sorted.length!==1?'s':'');
  const maxC = Math.max(...filtered.map(m=>m.totalCostNZD),1);
  document.getElementById('byPerson-body').innerHTML = sorted.map(m=>{
    const cpa = m.totalAssets>0 ? fmtNZD(m.totalCostNZD/m.totalAssets) : '—';
    const barPct = Math.round((m.totalCostNZD/maxC)*100);
    return \`<tr>
      <td>\${esc(m.name)}</td>
      <td>\${fmtNZD(m.totalCostNZD)}<br><div class="bar-wrap" style="margin-top:4px"><div class="bar-fill" style="width:\${barPct}%;background:var(--accent)"></div></div></td>
      <td>\${fmt(m.totalAssets)}</td>
      <td>\${cpa}</td>
      <td>\${fmt(m.totalHours,1)}h</td>
      <td><button onclick="toggleMember('\${m.gid}')" style="background:var(--bg3);border:1px solid var(--border);color:var(--muted);border-radius:5px;padding:3px 8px;cursor:pointer;font-size:12px">▼ Tasks</button></td>
    </tr>
    <tr id="member-detail-row-\${m.gid}" style="display:none">
      <td colspan="6" style="padding:0">
        <div id="member-detail-\${m.gid}" style="padding:16px;background:var(--bg3);border-top:1px solid var(--border)"></div>
      </td>
    </tr>\`;
  }).join('');
  updateSortHeaders('byPerson-table', col, dir);
}

function toggleMember(gid) {
  const row = document.getElementById('member-detail-row-'+gid);
  if (!row) return;
  const isOpen = row.style.display !== 'none';
  row.style.display = isOpen ? 'none' : 'table-row';
  if (isOpen) return;
  const m = MEMBERS.find(m=>m.gid===gid);
  if (!m) return;
  const tasks = m.tasks||[];
  const cpa = m.totalAssets>0 ? fmtNZD(m.totalCostNZD/m.totalAssets) : '—';
  document.getElementById('member-detail-'+gid).innerHTML = \`
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:16px">
      \${[['Total Cost',fmtNZD(m.totalCostNZD)],['Assets',fmt(m.totalAssets)],['Cost/Asset',cpa],['Hours',fmt(m.totalHours,1)+'h']].map(([l,v])=>\`<div><div style="font-size:11px;color:var(--muted)">\${esc(l)}</div><div style="font-size:18px;font-weight:700">\${esc(v)}</div></div>\`).join('')}
    </div>
    \${tasks.length===0?'<div class="empty">No open tasks</div>':\`
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr>
        \${['Task','Project','Due','Hours','Assets','Cost'].map(h=>\`<th style="padding:6px 10px;text-align:left;color:var(--muted);border-bottom:1px solid var(--border)">\${h}</th>\`).join('')}
      </tr></thead>
      <tbody>
        \${tasks.map(t=>{
          const h=taskHours(t), a=taskAssets(t), cost=taskCostCalc(t);
          const ov=!t.completed&&t.due_on&&new Date(t.due_on)<new Date(new Date().toDateString());
          return \`<tr>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border)"><a href="\${asanaLink(t.gid)}" target="_blank">\${esc(t.name)}</a>\${ov?' <span class="badge red">overdue</span>':''}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);color:var(--muted)">\${esc(t.projectName||'')}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);color:\${ov?'var(--danger)':'inherit'}">\${esc(t.due_on||'—')}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border)">\${h>0?fmt(h,1)+'h':'<span style="color:var(--warn)">—</span>'}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border)">\${a}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border)">\${cost>0?fmtNZD(cost):'—'}</td>
          </tr>\`;
        }).join('')}
      </tbody>
    </table>\`}
  \`;
}

// ── BY POD ────────────────────────────────────────────────────
function renderByPod() {
  sortState['byPod'] = sortState['byPod'] || {col:1,dir:'desc'};
  const {col,dir} = sortState['byPod'];
  const getVal = (p,c) => [p.name,p.totalCostNZD,p.totalAssets,p.totalAssets>0?p.totalCostNZD/p.totalAssets:0,p.memberCount,p.taskCount][c];
  const sorted = [...BY_POD].sort((a,b)=>{const av=getVal(a,col),bv=getVal(b,col);return dir==='asc'?(av>bv?1:av<bv?-1:0):(av<bv?1:av>bv?-1:0);});
  document.getElementById('byPod-count').textContent = sorted.length+' POD team'+(sorted.length!==1?'s':'');
  const maxC = Math.max(...sorted.map(p=>p.totalCostNZD),1);
  document.getElementById('byPod-body').innerHTML = sorted.map(p=>{
    const cpa = p.totalAssets>0 ? fmtNZD(p.totalCostNZD/p.totalAssets) : '—';
    const barPct = Math.round((p.totalCostNZD/maxC)*100);
    const id = p.name.replace(/[^a-zA-Z0-9]/g,'_');
    const maxAT = (p.assetTypes||[])[0]?.totalCostNZD || 1;
    const assetTypeRows = (p.assetTypes||[]).map((at,i)=>\`
      <div class="hbar-row" style="padding:5px 0">
        <div class="hbar-label" style="width:130px;font-size:11px" title="\${esc(at.name)}">\${esc(at.name)}</div>
        <div class="hbar-track" style="height:6px"><div class="hbar-fill" style="width:\${Math.round(at.totalCostNZD/maxAT*100)}%;background:\${PALETTE[i%PALETTE.length]}"></div></div>
        <div class="hbar-value" style="width:80px;font-size:11px">\${fmtNZD(at.totalCostNZD)}</div>
        <div style="width:50px;font-size:11px;color:var(--muted);text-align:right">\${fmt(at.totalAssets)} assets</div>
      </div>\`).join('');
    const memberRows = (p.members||[]).map(m=>{
      const mcpa = m.totalAssets>0?fmtNZD(m.totalCostNZD/m.totalAssets):'—';
      return \`<tr>
        <td style="padding:5px 10px;border-bottom:1px solid var(--border)">\${esc(m.name)}</td>
        <td style="padding:5px 10px;border-bottom:1px solid var(--border)">\${fmtNZD(m.totalCostNZD)}</td>
        <td style="padding:5px 10px;border-bottom:1px solid var(--border)">\${fmt(m.totalAssets)}</td>
        <td style="padding:5px 10px;border-bottom:1px solid var(--border)">\${mcpa}</td>
        <td style="padding:5px 10px;border-bottom:1px solid var(--border)">\${m.taskCount}</td>
      </tr>\`;
    }).join('');
    return \`<tr>
      <td style="font-weight:600">\${esc(p.name)}</td>
      <td>\${fmtNZD(p.totalCostNZD)}<br><div class="bar-wrap" style="margin-top:4px"><div class="bar-fill" style="width:\${barPct}%;background:var(--accent2)"></div></div></td>
      <td>\${fmt(p.totalAssets)}</td>
      <td>\${cpa}</td>
      <td>\${p.memberCount}</td>
      <td>\${p.taskCount}</td>
      <td><button onclick="togglePod('\${id}')" style="background:var(--bg3);border:1px solid var(--border);color:var(--muted);border-radius:5px;padding:3px 8px;cursor:pointer;font-size:12px">▼ Detail</button></td>
    </tr>
    <tr id="pod-detail-row-\${id}" style="display:none">
      <td colspan="7" style="padding:0">
        <div style="padding:16px 20px;background:var(--bg3);border-top:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:24px">
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:10px">Asset Types</div>
            \${assetTypeRows || '<div style="color:var(--muted);font-size:12px">No data</div>'}
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:10px">Members</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr>
                \${['Member','Cost','Assets','Cost/Asset','Tasks'].map(h=>\`<th style="padding:4px 10px;text-align:left;color:var(--muted);border-bottom:1px solid var(--border)">\${h}</th>\`).join('')}
              </tr></thead>
              <tbody>\${memberRows}</tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>\`;
  }).join('') || '<tr><td colspan="7" class="empty">No POD data</td></tr>';
  updateSortHeaders('byPod-table', col, dir);
}
function togglePod(id) {
  const row = document.getElementById('pod-detail-row-'+id);
  if (row) row.style.display = row.style.display==='none' ? 'table-row' : 'none';
}

// ── ALL TASKS ─────────────────────────────────────────────────
let allTasksData = [];
function renderTasks() {
  allTasksData = [];
  for (const m of MEMBERS) for (const t of (m.tasks||[])) allTasksData.push({...t,_memberName:m.name});
  sortState['tasks'] = sortState['tasks']||{col:6,dir:'desc'};
  filterTasks();
}
function filterTasks() {
  const q = (document.getElementById('tasks-search')?.value||'').toLowerCase();
  renderTasksTable(allTasksData.filter(t=>t.name.toLowerCase().includes(q)||(t._memberName||'').toLowerCase().includes(q)));
}
function renderTasksTable(rows) {
  const {col,dir} = sortState['tasks']||{col:6,dir:'desc'};
  const getVal = (t,c) => {
    const h=taskHours(t),a=taskAssets(t),cost=taskCostCalc(t);
    return [t.name,t._memberName,t.projectName||'',t.due_on||'',h,a,cost,a>0?cost/a:0][c];
  };
  const sorted = [...rows].sort((a,b)=>{const av=getVal(a,col),bv=getVal(b,col);return dir==='asc'?(av>bv?1:av<bv?-1:0):(av<bv?1:av>bv?-1:0);});
  document.getElementById('tasks-count').textContent = sorted.length+' task'+(sorted.length!==1?'s':'');
  document.getElementById('tasks-body').innerHTML = sorted.map(t=>{
    const h=taskHours(t),a=taskAssets(t),cost=taskCostCalc(t);
    const ov=!t.completed&&t.due_on&&new Date(t.due_on)<new Date(new Date().toDateString());
    return \`<tr>
      <td><a href="\${asanaLink(t.gid)}" target="_blank">\${esc(t.name)}</a></td>
      <td>\${esc(t._memberName||'')}</td>
      <td style="color:var(--muted)">\${esc(t.projectName||'')}</td>
      <td style="color:\${ov?'var(--danger)':'inherit'}">\${esc(t.due_on||'—')}\${ov?' <span class="badge red">late</span>':''}</td>
      <td>\${h>0?fmt(h,1)+'h':'<span style="color:var(--warn)">—</span>'}</td>
      <td>\${a}</td>
      <td>\${cost>0?fmtNZD(cost):'—'}</td>
      <td>\${a>0?fmtNZD(cost/a):'—'}</td>
    </tr>\`;
  }).join('') || '<tr><td colspan="8" class="empty">No tasks found</td></tr>';
  updateSortHeaders('tasks-table', col, dir);
}

// ── BY PROJECT ───────────────────────────────────────────────
function renderByProject() {
  sortState['byProject'] = sortState['byProject'] || {col:2, dir:'desc'};
  filterByProject();
}
function filterByProject() {
  const q = (document.getElementById('byProject-search')?.value||'').toLowerCase();
  const filtered = COMPLETED_PROJECTS.filter(p => p.name.toLowerCase().includes(q));
  const {col,dir} = sortState['byProject']||{col:2,dir:'desc'};
  const getVal = (p,c) => [p.name, p.completedAt||'', p.totalCostNZD, p.totalAssets, p.totalAssets>0?p.totalCostNZD/p.totalAssets:0, p.totalHours, p.memberCount][c];
  const sorted = [...filtered].sort((a,b)=>{const av=getVal(a,col),bv=getVal(b,col);return dir==='asc'?(av>bv?1:av<bv?-1:0):(av<bv?1:av>bv?-1:0);});
  document.getElementById('byProject-count').textContent = sorted.length+' completed project'+(sorted.length!==1?'s':'');
  const maxC = Math.max(...sorted.map(p=>p.totalCostNZD),1);
  document.getElementById('byProject-body').innerHTML = sorted.map(p=>{
    const cpa  = p.totalAssets>0 ? fmtNZD(p.totalCostNZD/p.totalAssets) : '—';
    const pct  = Math.round((p.totalCostNZD/maxC)*100);
    const safeId = 'proj_'+p.gid;
    const memberRows = (p.members||[]).map(m=>{
      const mcpa = m.totalAssets>0?fmtNZD(m.totalCostNZD/m.totalAssets):'—';
      return \`<tr>
        <td style="padding:5px 10px;border-bottom:1px solid var(--border)">\${esc(m.name)}</td>
        <td style="padding:5px 10px;border-bottom:1px solid var(--border)">\${fmtNZD(m.totalCostNZD)}</td>
        <td style="padding:5px 10px;border-bottom:1px solid var(--border)">\${fmt(m.totalAssets)}</td>
        <td style="padding:5px 10px;border-bottom:1px solid var(--border)">\${mcpa}</td>
      </tr>\`;
    }).join('');
    return \`<tr>
      <td style="font-weight:600;max-width:280px">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="\${esc(p.name)}">\${esc(p.name)}</div>
      </td>
      <td style="color:var(--muted)">\${p.completedAt||'—'}</td>
      <td>\${fmtNZD(p.totalCostNZD)}<br><div class="bar-wrap" style="margin-top:4px"><div class="bar-fill" style="width:\${pct}%;background:var(--accent2)"></div></div></td>
      <td>\${fmt(p.totalAssets)}</td>
      <td>\${cpa}</td>
      <td>\${fmt(p.totalHours,1)}h</td>
      <td>\${p.memberCount}</td>
      <td><button onclick="toggleProject('\${safeId}')" style="background:var(--bg3);border:1px solid var(--border);color:var(--muted);border-radius:5px;padding:3px 8px;cursor:pointer;font-size:12px">▼ Team</button></td>
    </tr>
    <tr id="\${safeId}-row" style="display:none">
      <td colspan="8" style="padding:0">
        <div style="padding:14px 20px;background:var(--bg3);border-top:1px solid var(--border)">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr>
              \${['Member','Cost','Assets','Cost/Asset'].map(h=>\`<th style="padding:4px 10px;text-align:left;color:var(--muted);border-bottom:1px solid var(--border)">\${h}</th>\`).join('')}
            </tr></thead>
            <tbody>\${memberRows || '<tr><td colspan="4" style="padding:8px 10px;color:var(--muted)">No member data</td></tr>'}</tbody>
          </table>
        </div>
      </td>
    </tr>\`;
  }).join('') || '<tr><td colspan="8" class="empty">No completed projects found</td></tr>';
  updateSortHeaders('byProject-table', col, dir);
}
function toggleProject(id) {
  const row = document.getElementById(id+'-row');
  if (row) row.style.display = row.style.display==='none' ? 'table-row' : 'none';
}
// ── MISSING FIELDS ───────────────────────────────────────────
function renderMissing() {
  const badge = document.getElementById('badge-missing');
  if (badge) badge.textContent = ALL_MISSING.length > 0 ? ALL_MISSING.length : '';
  filterMissing();
}
function filterMissing() {
  const q = (document.getElementById('missing-search')?.value||'').toLowerCase();
  const filtered = ALL_MISSING.filter(t =>
    t.name.toLowerCase().includes(q) || (t.memberName||'').toLowerCase().includes(q)
  );
  const {col,dir} = sortState['missing']||{col:4,dir:'desc'};
  const podOf = t => { const f=(t.custom_fields||[]).find(f=>f.gid===FIELD_PODS); return f?.enum_value?.name||'—'; };
  const getVal = (t,c) => [t.name, t.memberName||'', t.projectName||'', podOf(t), t.completed_at||''][c];
  const sorted = [...filtered].sort((a,b)=>{const av=getVal(a,col),bv=getVal(b,col);return dir==='asc'?(av>bv?1:av<bv?-1:0):(av<bv?1:av>bv?-1:0);});
  document.getElementById('missing-count').textContent =
    sorted.length + ' task' + (sorted.length!==1?'s':'') + ' contributing $0 to cost totals';
  document.getElementById('missing-body').innerHTML = sorted.map(t => {
    const pod = podOf(t);
    const hasEst  = (t.custom_fields||[]).some(f=>f.gid==='1203387567618671' && f.number_value);
    const hasCost = (t.custom_fields||[]).some(f=>f.gid==='1213828392202051' && f.number_value);
    const fix = !hasEst && !hasCost
      ? '<span class="badge yellow">Add Estimated time or Asset cost</span>'
      : !hasEst
        ? '<span class="badge yellow">Add Estimated time</span>'
        : '<span class="badge yellow">Add Asset cost</span>';
    return \`<tr>
      <td><a href="\${asanaLink(t.gid)}" target="_blank">\${esc(t.name)}</a></td>
      <td>\${esc(t.memberName||t.assignee?.name||'')}</td>
      <td style="color:var(--muted);font-size:12px">\${esc(t.projectName||'')}</td>
      <td>\${esc(pod)}</td>
      <td style="color:var(--muted)">\${t.completed_at?.slice(0,10)||'—'}</td>
      <td>\${fix}</td>
    </tr>\`;
  }).join('') || '<tr><td colspan="6" class="empty">No tasks with missing cost fields 🎉</td></tr>';
  updateSortHeaders('missing-table', col, dir);
  sortState['missing'] = sortState['missing'] || {col:4,dir:'desc'};
}

// ── DATE RANGE ────────────────────────────────────────────────
let _allTasksCache = null;
function getAllTasksFlat() {
  if (_allTasksCache) return _allTasksCache;
  _allTasksCache = [];
  for (const m of MEMBERS) for (const t of (m.tasks||[])) _allTasksCache.push({...t, _memberName: m.name});
  return _allTasksCache;
}

function currentQuarter() { return Math.floor(new Date().getMonth() / 3) + 1; }

function setQuarter(q) {
  const yr = new Date().getFullYear();
  const ranges = [['01-01','03-31'],['04-01','06-30'],['07-01','09-30'],['10-01','12-31']];
  document.getElementById('dr-from').value = \`\${yr}-\${ranges[q-1][0]}\`;
  document.getElementById('dr-to').value   = \`\${yr}-\${ranges[q-1][1]}\`;
  document.querySelectorAll('.q-btn').forEach((b,i) => b.classList.toggle('active', i+1===q));
  applyDateRange();
}

function clearQBtns() { document.querySelectorAll('.q-btn').forEach(b => b.classList.remove('active')); }

function initDateRange() {
  // Populate POD dropdown
  const pods = [...new Set(getAllTasksFlat().map(t=>getEnumField(t,FIELD_PODS)).filter(Boolean))].sort();
  const podSel = document.getElementById('dr-pod');
  pods.forEach(p => { const o=document.createElement('option'); o.value=o.textContent=p; podSel.appendChild(o); });

  // Populate person dropdown
  const persons = [...new Set(MEMBERS.map(m=>m.name))].sort();
  const perSel = document.getElementById('dr-person');
  persons.forEach(p => { const o=document.createElement('option'); o.value=o.textContent=p; perSel.appendChild(o); });

  // Default to current quarter
  setQuarter(currentQuarter());
}

function applyDateRange() {
  const from   = document.getElementById('dr-from').value;
  const to     = document.getElementById('dr-to').value;
  const pod    = document.getElementById('dr-pod').value;
  const person = document.getElementById('dr-person').value;
  if (!from || !to) return;

  const fromD = new Date(from), toD = new Date(to);
  const tasks = getAllTasksFlat().filter(t => {
    // Filter by completed_at (when work was actually delivered)
    const dateStr = t.completed_at ? t.completed_at.slice(0,10) : t.due_on;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (d < fromD || d > toD) return false;
    if (pod    && getEnumField(t, FIELD_PODS) !== pod) return false;
    if (person && t._memberName !== person) return false;
    return true;
  });

  let totalCost=0, totalAssets=0, totalHours=0;
  tasks.forEach(t => { totalCost+=taskCostCalc(t); totalAssets+=taskAssets(t); totalHours+=taskHours(t); });
  const cpa = totalAssets>0 ? fmtNZD(totalCost/totalAssets) : '—';

  document.getElementById('dr-kpis').innerHTML = [
    ['Total Cost',    fmtNZD(totalCost),       ''],
    ['Assets',        fmt(totalAssets),         ''],
    ['Avg Cost/Asset',cpa,                      ''],
    ['Hours',         fmt(totalHours,1)+'h',    ''],
    ['Tasks',         tasks.length,             ''],
  ].map(([l,v])=>\`<div class="kpi"><div class="label">\${esc(l)}</div><div class="value">\${esc(String(v))}</div></div>\`).join('');

  const sorted = [...tasks].sort((a,b)=>taskCostCalc(b)-taskCostCalc(a));
  document.getElementById('dr-count').textContent = sorted.length+' completed task'+(sorted.length!==1?'s':'')+' delivered in range';
  document.getElementById('dr-body').innerHTML = sorted.map(t => {
    const h=taskHours(t), a=taskAssets(t), cost=taskCostCalc(t);
    const podName = getEnumField(t, FIELD_PODS) || '—';
    const ov = t.due_on && new Date(t.due_on)<new Date(new Date().toDateString());
    return \`<tr>
      <td><a href="\${asanaLink(t.gid)}" target="_blank">\${esc(t.name)}</a></td>
      <td>\${esc(t._memberName||'')}</td>
      <td>\${esc(podName)}</td>
      <td style="color:var(--muted)">\${esc(t.projectName||'')}</td>
      <td style="color:\${ov?'var(--danger)':'inherit'}">\${esc(t.due_on||'—')}</td>
      <td>\${h>0?fmt(h,1)+'h':'<span style="color:var(--warn)">—</span>'}</td>
      <td>\${a}</td>
      <td>\${cost>0?fmtNZD(cost):'—'}</td>
      <td>\${a>0?fmtNZD(cost/a):'—'}</td>
    </tr>\`;
  }).join('') || '<tr><td colspan="9" class="empty">No tasks due in this date range</td></tr>';
}

// ── init ──────────────────────────────────────────────────────
renderOverview();
renderByPerson();
renderByPod();
renderTasks();
renderByProject();
renderMissing();
initDateRange();
</script>
</body>
</html>`;
}

function saveReport(html, date) {
  const dir = process.env.REPORTS_DIR || "reports";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dateStr  = date.toISOString().slice(0, 10);
  const filePath = path.join(dir, `xcf-cost-per-asset-${dateStr}.html`);
  fs.writeFileSync(filePath, html, "utf8");
  return filePath;
}

module.exports = { generateHtml, saveReport };
