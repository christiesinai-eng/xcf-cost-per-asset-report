// src/asana.js — pulls tasks & cost data from Asana REST API
// Field GIDs confirmed against live workspace 1211868948534506

const axios = require("axios");

const BASE_URL = "https://app.asana.com/api/1.0";

const FIELD = {
  ESTIMATED_TIME:    "1203387567618671", // "Estimated time" (minutes stored as number)
  MINUTE_RATE:       "1213826548214530", // "Average Minute Rate (XCF)" ($/min)
  ASSET_COUNT:       "1212213385632145", // "Asset count (XCF)" (number)
  ASSET_COST:        "1213828392202051", // "XCF: Asset cost" (pre-calculated $)
  PODS:              "1211165589636938", // "PODS (XCF)" (enum)
  MICRO_DELIVERABLE: "1211869929084571", // "Micro deliverables (XCF)" (enum)
};

// Projects excluded from all data — admin boards, duplicates, non-production
const EXCLUDED_PROJECT_GIDS = new Set([
  "1212300038541375", // XCF: Cost per asset + Asset counter (Roadmap Projects & Micro/BAU tasks)
  "1212867822525791", // XCF: Leave calendar (NOW USE THE NEW WAY)!
  "1213304739367972", // XCF: AI Usage (Roadmap Projects & Micro/BAU tasks)
  "1211107465321812", // Carmen Tan - Hub onboarding
  "1212851099876152", // XCF: 2027 Goals
  "1212203594687934", // The Creative Foundry Roadmap requests
]);

const DEFAULT_MINUTE_RATE   = parseFloat(process.env.DEFAULT_MINUTE_RATE   || "2.33");
const WORKING_HOURS_PER_DAY = parseFloat(process.env.WORKING_HOURS_PER_DAY || "8");

function client() {
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${process.env.ASANA_TOKEN}` },
  });
}

function getNumField(task, gid) {
  const f = (task.custom_fields || []).find((f) => f.gid === gid);
  return f ? (f.number_value ?? null) : null;
}

function getEnumField(task, gid) {
  const f = (task.custom_fields || []).find((f) => f.gid === gid);
  return f ? (f.enum_value?.name ?? null) : null;
}

// Estimated time field stores MINUTES — convert to hours for display/calculation
function estHours(task) {
  const mins = getNumField(task, FIELD.ESTIMATED_TIME) || 0;
  return mins / 60;
}

// Classify task by asset type: enum field first, then task name keywords
function extractAssetType(task) {
  const enumVal = getEnumField(task, FIELD.MICRO_DELIVERABLE);
  if (enumVal && enumVal !== "Other") return enumVal;

  const name = (task.name || "").toLowerCase();
  if (/\bvideo\b|\breels?\b|\bfilm\b/.test(name))                              return "Video";
  if (/\bgif\b|\banimation\b|\bmotion\b/.test(name))                           return "Animation";
  if (/\bbanner\b/.test(name))                                                  return "Banner";
  if (/\bemail\b|\bedm\b|\bnewsletter\b/.test(name))                           return "Email";
  if (/\bsocial\b|\binstagram\b|\blinkedin\b|\bfacebook\b|\bmeta\b|\btiktok\b/.test(name)) return "Social";
  if (/\blogo\b/.test(name))                                                    return "Logo";
  if (/\btemplate\b|\bcanva\b/.test(name))                                      return "Template";
  if (/\bpresentation\b|\bdeck\b|\bslides?\b/.test(name))                      return "Presentation";
  if (/\bprint\b|\bposter\b|\bbillboard\b|\bsignage\b|\bcling\b|\bflyer\b/.test(name)) return "Print / Signage";
  if (/\billustration\b|\bicon\b/.test(name))                                  return "Illustration";
  if (/\bcopy\b|\bwriting\b|\bcontent\b|\bblog\b/.test(name))                  return "Copy";
  if (/\bguide\b|\bdocument\b|\breport\b|\bbrief\b/.test(name))               return "Document";
  if (/\bwebsite\b|\bweb\b|\blanding\b/.test(name))                            return "Web";
  if (/\bevent\b|\bxerocon\b|\bwebinar\b|\bconference\b/.test(name))          return "Event";
  if (enumVal) return enumVal; // "Other" from enum
  return "Other";
}

function workingDaysBetween(startStr, endStr) {
  if (!startStr || !endStr) return 1;
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (s > e) return 1;
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(count, 1);
}

// Returns actual hours (not minutes) spread on targetDate
function hoursOnDay(task, targetDate) {
  if (task.completed || !task.due_on) return 0;
  const mins = getNumField(task, FIELD.ESTIMATED_TIME);
  if (!mins) return 0;
  const start  = task.start_on || task.due_on;
  const end    = task.due_on;
  const startD = new Date(start);
  const endD   = new Date(end);
  const targetD = new Date(targetDate);
  if (targetD < startD || targetD > endD) return 0;
  const dow = targetD.getDay();
  if (dow === 0 || dow === 6) return 0;
  const days = workingDaysBetween(start, end);
  return (mins / days) / 60; // convert minutes to hours
}

function isOverdue(task) {
  if (task.completed || !task.due_on) return false;
  return new Date(task.due_on) < new Date(new Date().toDateString());
}

function isMissingFields(task) {
  if (task.completed) return false;
  const mins = getNumField(task, FIELD.ESTIMATED_TIME);
  return !mins || !task.due_on;
}

function taskCost(task) {
  const preCalc = getNumField(task, FIELD.ASSET_COST);
  if (preCalc != null && preCalc > 0) return preCalc;
  const mins = getNumField(task, FIELD.ESTIMATED_TIME) || 0;
  const rate  = getNumField(task, FIELD.MINUTE_RATE) ?? DEFAULT_MINUTE_RATE;
  return mins * rate; // minutes × $/min = $
}

function taskAssets(task) {
  return getNumField(task, FIELD.ASSET_COUNT) || 1;
}

async function fetchAllProjects() {
  const c = client();

  const overrideGids = (process.env.ASANA_PROJECT_GIDS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (overrideGids.length > 0) {
    console.log(`   ↳ Using ${overrideGids.length} project GID(s) from ASANA_PROJECT_GIDS`);
    return overrideGids
      .filter((gid) => !EXCLUDED_PROJECT_GIDS.has(gid))
      .map((gid) => ({ gid, name: gid }));
  }

  const teamGid  = process.env.ASANA_TEAM_GID;
  const endpoint = teamGid
    ? `/teams/${teamGid}/projects`
    : `/workspaces/${process.env.ASANA_WORKSPACE_GID}/projects`;
  const scopeLabel = teamGid ? `team ${teamGid}` : "workspace";

  const projects = [];
  let offset = null;
  do {
    const params = { opt_fields: "gid,name", limit: 100, archived: false };
    if (offset) params.offset = offset;
    try {
      const res = await c.get(endpoint, { params });
      projects.push(...(res.data.data || []));
      offset = res.data.next_page?.offset || null;
    } catch (err) {
      console.warn(` ⚠️  Could not fetch projects (${scopeLabel}):`, err.message);
      break;
    }
  } while (offset);

  const filtered = projects.filter((p) => !EXCLUDED_PROJECT_GIDS.has(p.gid));
  console.log(`   ↳ Auto-discovered ${filtered.length} project(s) from ${scopeLabel} (${projects.length - filtered.length} excluded)`);
  return filtered;
}

async function fetchTasksForProject(project) {
  const c = client();
  const tasks = [];
  let offset = null;
  const optFields = [
    "gid", "name", "completed", "due_on", "start_on",
    "assignee.gid", "assignee.name", "assignee.email",
    "memberships.project.gid", "memberships.project.name",
    "custom_fields.gid", "custom_fields.name",
    "custom_fields.type", "custom_fields.number_value",
    "custom_fields.enum_value",
  ].join(",");
  do {
    const params = { opt_fields: optFields, limit: 100, completed_since: "now" };
    if (offset) params.offset = offset;
    try {
      const res = await c.get(`/projects/${project.gid}/tasks`, { params });
      tasks.push(...(res.data.data || []));
      offset = res.data.next_page?.offset || null;
    } catch (err) {
      if (err.response?.status === 403) {
        console.warn(`   ↳ Skipping ${project.name} (403 Forbidden)`);
        break;
      }
      console.warn(`   ↳ Error fetching ${project.name}: ${err.message}`);
      break;
    }
  } while (offset);
  return tasks;
}

function buildMemberData(memberInfo, tasks) {
  const today  = new Date().toISOString().slice(0, 10);

  let totalHours = 0, totalCostNZD = 0, totalAssets = 0;
  let hoursToday = 0, costToday = 0;
  let hoursNext7 = 0, costNext7 = 0;
  let hoursNext21 = 0, costNext21 = 0;
  const overdueList = [];
  const missingList = [];

  for (const task of tasks) {
    if (task.completed) continue;
    const hrs    = estHours(task); // actual hours
    const cost   = taskCost(task);
    const assets = taskAssets(task);

    totalHours   += hrs;
    totalCostNZD += cost;
    totalAssets  += assets;

    const h0 = hoursOnDay(task, today);
    if (h0 > 0) {
      hoursToday += h0;
      costToday  += cost * (h0 / (hrs || 1));
    }

    let h7 = 0;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
      h7 += hoursOnDay(task, d);
    }
    if (h7 > 0) { hoursNext7 += h7; costNext7 += cost * (h7 / (hrs || 1)); }

    let h21 = 0;
    for (let i = 1; i <= 21; i++) {
      const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
      h21 += hoursOnDay(task, d);
    }
    if (h21 > 0) { hoursNext21 += h21; costNext21 += cost * (h21 / (hrs || 1)); }

    if (isOverdue(task))      overdueList.push({ ...task, memberName: memberInfo.name });
    if (isMissingFields(task)) missingList.push({ ...task, memberName: memberInfo.name });
  }

  return {
    gid:          memberInfo.gid,
    name:         memberInfo.name,
    email:        memberInfo.email || "",
    totalHours,
    totalCostNZD,
    totalAssets,
    hoursToday,
    costToday,
    hoursNext7,
    costNext7,
    hoursNext21,
    costNext21,
    overdueCount: overdueList.length,
    missingCount: missingList.length,
    overdueList,
    missingList,
    tasks: tasks.filter((t) => !t.completed),
  };
}

async function fetchTeamMembers() {
  const teamGid = process.env.ASANA_TEAM_GID;
  if (!teamGid) return null;
  try {
    const c = client();
    const r = await c.get(`/teams/${teamGid}/users`, { params: { opt_fields: "gid", limit: 100 } });
    return new Set(r.data.data.map((u) => u.gid));
  } catch (err) {
    console.warn(" ⚠️  Could not fetch team members:", err.message);
    return null;
  }
}

async function fetchReportData() {
  const projects = await fetchAllProjects();
  console.log(`   ↳ Fetching tasks from ${projects.length} project(s)...`);

  // Fetch team allowlist and explicit exclusions in parallel
  const [teamMemberGids] = await Promise.all([fetchTeamMembers()]);
  const excludedMemberGids = new Set(
    (process.env.EXCLUDED_MEMBER_GIDS || "").split(",").map((s) => s.trim()).filter(Boolean)
  );

  const memberMap = new Map();
  const allOverdue = [];
  const allMissing = [];

  for (const project of projects) {
    const tasks = await fetchTasksForProject(project);
    for (const task of tasks) {
      if (!task.assignee) continue;
      const { gid, name, email } = task.assignee;
      // Skip anyone not on the TCF team, or explicitly excluded
      if (teamMemberGids && !teamMemberGids.has(gid)) continue;
      if (excludedMemberGids.has(gid)) continue;
      if (!memberMap.has(gid)) {
        memberMap.set(gid, { info: { gid, name, email: email || "" }, tasks: [] });
      }
      memberMap.get(gid).tasks.push({ ...task, projectName: project.name });
    }
  }

  const members = [];
  for (const { info, tasks } of memberMap.values()) {
    const m = buildMemberData(info, tasks);
    members.push(m);
    allOverdue.push(...m.overdueList);
    allMissing.push(...m.missingList);
  }
  members.sort((a, b) => b.totalCostNZD - a.totalCostNZD);

  const totals = members.reduce(
    (acc, m) => ({
      totalHours:         acc.totalHours         + m.totalHours,
      totalCostNZD:       acc.totalCostNZD       + m.totalCostNZD,
      totalAssets:        acc.totalAssets        + m.totalAssets,
      hoursToday:         acc.hoursToday         + m.hoursToday,
      costToday:          acc.costToday          + m.costToday,
      hoursNext7:         acc.hoursNext7         + m.hoursNext7,
      costNext7:          acc.costNext7          + m.costNext7,
      hoursNext21:        acc.hoursNext21        + m.hoursNext21,
      costNext21:         acc.costNext21         + m.costNext21,
      overdueCount:       acc.overdueCount       + m.overdueCount,
      missingFieldsCount: acc.missingFieldsCount + m.missingCount,
      overCapacityCount:  acc.overCapacityCount  + (m.hoursToday > 8 ? 1 : 0),
      availableCount:     acc.availableCount     + (m.hoursToday < 3 ? 1 : 0),
    }),
    {
      totalHours: 0, totalCostNZD: 0, totalAssets: 0,
      hoursToday: 0, costToday: 0,
      hoursNext7: 0, costNext7: 0,
      hoursNext21: 0, costNext21: 0,
      overdueCount: 0, missingFieldsCount: 0,
      overCapacityCount: 0, availableCount: 0,
    }
  );
  totals.memberCount  = members.length;
  totals.projectCount = projects.length;

  // Rollup by POD team (with asset type breakdown)
  const podMap        = new Map();
  const deliverableMap = new Map();

  for (const m of members) {
    for (const task of m.tasks) {
      const pod        = getEnumField(task, FIELD.PODS)  || "Unassigned";
      const assetType  = extractAssetType(task);
      const cost   = taskCost(task);
      const assets = taskAssets(task);

      // POD
      if (!podMap.has(pod)) podMap.set(pod, { name: pod, totalCostNZD: 0, totalAssets: 0, taskCount: 0, memberMap: new Map(), assetTypeMap: new Map() });
      const p = podMap.get(pod);
      p.totalCostNZD += cost; p.totalAssets += assets; p.taskCount++;
      if (!p.memberMap.has(m.gid)) p.memberMap.set(m.gid, { gid: m.gid, name: m.name, totalCostNZD: 0, totalAssets: 0, taskCount: 0 });
      const pm = p.memberMap.get(m.gid);
      pm.totalCostNZD += cost; pm.totalAssets += assets; pm.taskCount++;
      if (!p.assetTypeMap.has(assetType)) p.assetTypeMap.set(assetType, { name: assetType, totalCostNZD: 0, totalAssets: 0 });
      const pa = p.assetTypeMap.get(assetType);
      pa.totalCostNZD += cost; pa.totalAssets += assets;

      // Deliverable (global)
      if (!deliverableMap.has(assetType)) deliverableMap.set(assetType, { name: assetType, totalCostNZD: 0, totalAssets: 0, taskCount: 0 });
      const d = deliverableMap.get(assetType);
      d.totalCostNZD += cost; d.totalAssets += assets; d.taskCount++;
    }
  }

  const byPod = [...podMap.values()]
    .filter((p) => p.name !== "Unassigned")
    .map((p) => ({
      name:         p.name,
      totalCostNZD: p.totalCostNZD,
      totalAssets:  p.totalAssets,
      taskCount:    p.taskCount,
      memberCount:  p.memberMap.size,
      members:      [...p.memberMap.values()].sort((a, b) => b.totalCostNZD - a.totalCostNZD),
      assetTypes:   [...p.assetTypeMap.values()].sort((a, b) => b.totalCostNZD - a.totalCostNZD),
    }))
    .sort((a, b) => b.totalCostNZD - a.totalCostNZD);

  const byDeliverable = [...deliverableMap.values()].sort((a, b) => b.totalCostNZD - a.totalCostNZD);

  return { members, totals, allOverdue, allMissing, byPod, byDeliverable, generatedAt: new Date() };
}

module.exports = { fetchReportData };
