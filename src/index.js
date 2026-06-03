// src/index.js — scheduler + orchestrator

require("dotenv").config();
const cron = require("node-cron");
const { fetchReportData } = require("./asana");
const { generateHtml, saveReport } = require("./report");
const { postToSlack } = require("./slack");

const args = process.argv.slice(2);
const RUN_NOW = args.includes("--run-now");
const DRY_RUN = args.includes("--dry-run");

function validateEnv() {
  const required = ["ASANA_TOKEN", "ASANA_WORKSPACE_GID", "SLACK_TOKEN", "SLACK_CHANNEL_ID"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("❌ Missing required env vars:", missing.join(", "));
    console.error("Copy .env.example to .env and fill in all values.");
    process.exit(1);
  }
}

async function run() {
  const now = new Date();
  console.log(`\n🚀 Cost per Asset Report — ${now.toLocaleString("en-NZ")}`);
  try {
    console.log("\n[1/3] Fetching Asana data...");
    const data = await fetchReportData();
    console.log(`   ↳ ${data.members.length} members · ${data.totals.taskCount} completed tasks · ${data.totals.missingFieldsCount} missing fields`);
    console.log("\n[2/3] Generating HTML report...");
    const html = generateHtml(data);
    const reportPath = saveReport(html, now);
    console.log(`   ↳ Saved to: ${reportPath}`);
    console.log("\n[3/3] Posting to Slack...");
    await postToSlack(data, reportPath, DRY_RUN);
    console.log(`\n✅ Done -- ${now.toLocaleString("en-NZ")}\n`);
  } catch (err) {
    console.error("\n❌ Report failed:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

validateEnv();

if (RUN_NOW) {
  run();
} else {
  const CRON = "0 17 * * *"; // 5am NZST (UTC+12)
  console.log(`⏰ Scheduler started. Cron: ${CRON} UTC (5am NZT)`);
  cron.schedule(CRON, () => run());
}
