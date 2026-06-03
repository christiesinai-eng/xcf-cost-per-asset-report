// src/asana.js — pulls COMPLETED tasks & cost data from Asana REST API
// Only counts tasks where completed = true, from projects starting with X, 8 or 9
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

// Projects excluded regardless of name prefix
const EXCLUDED_PROJECT_GIDS = new Set([
  "1212300038541375", // XCF: Cost per asset + Asset counter
  "1212867822525791", // XCF: Leave calendar (NOW USE THE NEW WAY)!
  "1213304739367972", // XCF: AI Usage
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

// Estimated time field stores MINUTES — convert to hours
function estHours(task) {
  return (getNumField(task, FIELD.ESTIMATED_TIME) || 0) / 60;
}

// Classify task by asset type: enum field first, then task name keywords
function extractAssetType(task) {
  const enumVal = getEnumField(task, FIELD.MICRO_DELIVERABLE);
  if (enumVal && enumVal !== "Other") return enumVal;

  const name = (task.name || "").toLowerCase();
  if (/\bvideo\b|\breels?\b|\bfilm\b/.test(name))                                          return "Video";
  if (/\bstoryboard\b|\bboardomatic\b/.test(name))                                         return "Storyboard";
  if (/\bgif\b|\banimation\b|\bmotion\b/.test(name))                                       return "Animation";
  if (/\bbanner\b|\bresize\b/.test(name))                                                   return "Banner";
  if (/\bemail\b|\bedm\b|\bnewsletter\b/.test(name))                                       return "Email";
  if (/\bsocial\b|\binstagram\b|\blinkedin\b|\bfacebook\b|\bmeta\b|\btiktok\b/.test(name)) return "Social";
  if (/\blogo\b/.test(name))                                                                return "Logo";
  if (/\btemplate\b|\bcanva\b/.test(name))                                                  return "Template";
  if (/\bpresentation\b|\bdeck\b|\bslides?\b|\bpowerpoint\b/.test(name))                   return "Presentation";
  if (/\bprint\b|\bposter\b|\bbillboard\b|\bsignage\b|\bcling\b|\bflyer\b/.test(name))     return "Print / Signage";
  if (/\billustration\b|\bicon\b/.test(name))                                               return "Illustration";
  if (/\bcopy\b|\bwriting\b|\bcontent\b|\bblog\b/.test(name))                              return "Copy";
  if (/\bguide\b|\bdocument\b|\breport\b|\bbrief\b/.test(name))                            return "Document";
  if (/\bwebsite\b|\bweb\b|\blanding\b|\bhero\b/.test(name))                               return "Web / Hero";
  if (/\bevent\b|\bxerocon\b|\bwebinar\b|\bconference\b/.test(name))                       return "Event";
  if (/\bdelivery support\b|\bdelivery\b/.test(name))                                      return "Delivery Support";
  if (/\bcomms\b|\bcommunication\b/.test(name))                                             return "Communications";
  if (enumVal) return enumVal;
  return "Other";
}

function isMissingFields(task) {
  // Only flag if cost genuinely can't be calculated —
  // i.e. neither the pre-calculated Asset cost nor Estimated time is set
  const preCalc = getNumField(task, FIELD.ASSET_COST);
  if (preCalc != null && preCalc > 0) return false; // pre-calculated cost exists, fine
  const mins = getNumField(task, FIELD.ESTIMATED_TIME);
  return !mins; // no estimated time AND no pre-calc = can't calculate cost
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
      console.warn(` ⚠️  Could not fetch projects:`, err.message);
      break;
    }
  } while (offset);

  // Only include projects whose names start with X, 8 or 9 — these are the
  // canonical XCF project boards. Others are multi-homed/template/admin projects.
  const filtered = projects.filter((p) =>
    !EXCLUDED_PROJECT_GIDS.has(p.gid) && /^[X89]/i.test(p.name)
  );
  const excluded = projects.length - filtered.length;
  console.log(`   ↳ ${filtered.length} XCF project(s) found (${excluded} non-XCF excluded)`);
  return filtered;
}

async function fetchTasksForProject(project) {
  const c = client();
  const tasks = [];
  let offset = null;
  const optFields = [
    "gid", "name", "completed", "completed_at", "due_on", "start_on",
    "assignee.gid", "assignee.name", "assignee.email",
    "memberships.project.gid", "memberships.project.name",
    "custom_fields.gid", "custom_fields.name",
    "custom_fields.type", "custom_fields.number_value",
    "custom_fields.enum_value",
  ].join(",");
  do {
    // completed_since with a past date returns both completed + incomplete tasks;
    // we then filter client-side to completed === true only
    const params = { opt_fields: optFields, limit: 100, completed_since: "2024-01-01" };
    if (offset) params.offset = offset;
    try {
      const res = await c.get(`/projects/${project.gid}/tasks`, { params });
      tasks.push(...(res.data.data || []));
      offset = res.data.next_page?.offset || null;
    } catch (err) {
      if (err.response?.status === 403) {
        console.warn(`   ↳ Skipping ${project.name} (403)`);
        break;
      }
      console.warn(`   ↳ Error fetching ${project.name}: ${err.message}`);
      break;
    }
  } while (offset);
  return tasks;
}

function buildMemberData(memberInfo, tasks) {
  let totalHours = 0, totalCostNZD = 0, totalAssets = 0;
  const missingList = [];

  for (const task of tasks) {
    // Only count completed tasks
    if (!task.completed) continue;

    const hrs    = estHours(task);
    const cost   = taskCost(task);
    const assets = taskAssets(task);

    totalHours   += hrs;
    totalCostNZD += cost;
    totalAssets  += assets;

    if (isMissingFields(task)) missingList.push({ ...task, memberName: memberInfo.name });
  }

  return {
    gid:          memberInfo.gid,
    name:         memberInfo.name,
    email:        memberInfo.email || "",
    totalHours,
    totalCostNZD,
    totalAssets,
    missingCount: missingList.length,
    missingList,
    tasks: tasks.filter((t) => t.completed),
  };
}

async function fetchCompletedProjectCosts() {
  const c = client();
  // Fetch all projects (including completed ones — no archived:false filter here)
  let all = [], offset = null;
  const teamGid = process.env.ASANA_TEAM_GID;
  do {
    const params = { opt_fields: "gid,name,completed,completed_at", limit: 100 };
    if (offset) params.offset = offset;
    try {
      const res = await c.get(`/teams/${teamGid}/projects`, { params });
      all.push(...(res.data.data || []));
      offset = res.data.next_page?.offset || null;
    } catch (err) {
      console.warn(" ⚠️  Could not fetch completed projects:", err.message);
      break;
    }
  } while (offset);

  const completedProjects = all.filter(
    (p) => p.completed && !EXCLUDED_PROJECT_GIDS.has(p.gid) && /^[X89]/i.test(p.name)
  );
  console.log(`   ↳ ${completedProjects.length} completed XCF project(s) found`);

  const results = [];
  for (const project of completedProjects) {
    const tasks = await fetchTasksForProject(project);
    let totalCostNZD = 0, totalAssets = 0, totalHours = 0;
    const memberMap = new Map();

    for (const task of tasks) {
      const cost   = taskCost(task);
      const assets = taskAssets(task);
      const hrs    = estHours(task);
      totalCostNZD += cost;
      totalAssets  += assets;
      totalHours   += hrs;
      if (task.assignee) {
        const { gid, name } = task.assignee;
        if (!memberMap.has(gid)) memberMap.set(gid, { name, totalCostNZD: 0, totalAssets: 0 });
        const m = memberMap.get(gid);
        m.totalCostNZD += cost;
        m.totalAssets  += assets;
      }
    }

    results.push({
      gid:          project.gid,
      name:         project.name,
      completedAt:  project.completed_at?.slice(0, 10) || null,
      totalCostNZD,
      totalAssets,
      totalHours,
      taskCount:    tasks.length,
      memberCount:  memberMap.size,
      members:      [...memberMap.values()].sort((a, b) => b.totalCostNZD - a.totalCostNZD),
    });
  }

  return results.sort((a, b) => b.totalCostNZD - a.totalCostNZD);
}

async function fetchReportData() {
  const projects = await fetchAllProjects();
  console.log(`   ↳ Fetching completed tasks from ${projects.length} project(s)...`);

  const [teamMemberGids] = await Promise.all([fetchTeamMembers()]);
  const excludedMemberGids = new Set(
    (process.env.EXCLUDED_MEMBER_GIDS || "").split(",").map((s) => s.trim()).filter(Boolean)
  );

  const memberMap   = new Map();
  const allMissing  = [];
  const seenTaskGids = new Set(); // deduplicate multi-homed tasks

  for (const project of projects) {
    const tasks = await fetchTasksForProject(project);
    for (const task of tasks) {
      if (!task.assignee) continue;
      if (seenTaskGids.has(task.gid)) continue; // skip if already counted from another project
      seenTaskGids.add(task.gid);

      const { gid, name, email } = task.assignee;
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
    if (m.totalCostNZD === 0 && m.totalAssets === 0) continue; // skip members with no completed work
    members.push(m);
    allMissing.push(...m.missingList);
  }
  members.sort((a, b) => b.totalCostNZD - a.totalCostNZD);

  const totals = members.reduce(
    (acc, m) => ({
      totalHours:         acc.totalHours         + m.totalHours,
      totalCostNZD:       acc.totalCostNZD       + m.totalCostNZD,
      totalAssets:        acc.totalAssets        + m.totalAssets,
      missingFieldsCount: acc.missingFieldsCount + m.missingCount,
    }),
    { totalHours: 0, totalCostNZD: 0, totalAssets: 0, missingFieldsCount: 0 }
  );
  totals.memberCount  = members.length;
  totals.projectCount = projects.length;
  totals.taskCount    = seenTaskGids.size;

  // Rollup by POD and asset type
  const podMap         = new Map();
  const deliverableMap = new Map();

  for (const m of members) {
    for (const task of m.tasks) {
      const pod       = getEnumField(task, FIELD.PODS) || "Unassigned";
      const assetType = extractAssetType(task);
      const cost      = taskCost(task);
      const assets    = taskAssets(task);

      if (pod !== "Unassigned") {
        if (!podMap.has(pod)) podMap.set(pod, { name: pod, totalCostNZD: 0, totalAssets: 0, taskCount: 0, memberMap: new Map(), assetTypeMap: new Map() });
        const p = podMap.get(pod);
        p.totalCostNZD += cost; p.totalAssets += assets; p.taskCount++;
        if (!p.memberMap.has(m.gid)) p.memberMap.set(m.gid, { gid: m.gid, name: m.name, totalCostNZD: 0, totalAssets: 0, taskCount: 0 });
        const pm = p.memberMap.get(m.gid);
        pm.totalCostNZD += cost; pm.totalAssets += assets; pm.taskCount++;
        if (!p.assetTypeMap.has(assetType)) p.assetTypeMap.set(assetType, { name: assetType, totalCostNZD: 0, totalAssets: 0 });
        const pa = p.assetTypeMap.get(assetType);
        pa.totalCostNZD += cost; pa.totalAssets += assets;
      }

      if (!deliverableMap.has(assetType)) deliverableMap.set(assetType, { name: assetType, totalCostNZD: 0, totalAssets: 0, taskCount: 0, tasks: [] });
      const d = deliverableMap.get(assetType);
      d.totalCostNZD += cost; d.totalAssets += assets; d.taskCount++;
      d.tasks.push({ gid: task.gid, name: task.name, memberName: m.name, projectName: task.projectName, cost, assets });
    }
  }

  const byPod = [...podMap.values()]
    .map((p) => ({
      name: p.name, totalCostNZD: p.totalCostNZD, totalAssets: p.totalAssets,
      taskCount: p.taskCount, memberCount: p.memberMap.size,
      members:    [...p.memberMap.values()].sort((a, b) => b.totalCostNZD - a.totalCostNZD),
      assetTypes: [...p.assetTypeMap.values()].sort((a, b) => b.totalCostNZD - a.totalCostNZD),
    }))
    .sort((a, b) => b.totalCostNZD - a.totalCostNZD);

  const byDeliverable = [...deliverableMap.values()].sort((a, b) => b.totalCostNZD - a.totalCostNZD);

  console.log("\n   Fetching completed project costs...");
  const completedProjects = await fetchCompletedProjectCosts();

  return { members, totals, allMissing, byPod, byDeliverable, completedProjects, generatedAt: new Date() };
}

module.exports = { fetchReportData };
