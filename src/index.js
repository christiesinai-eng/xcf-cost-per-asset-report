// src/index.js — orchestrator

require("dotenv").config();
const { fetchReportData } = require("./asana");
const { generateHtml, saveReport } = require("./report");

const args   = process.argv.slice(2);
const RUN_NOW = args.includes("--run-now");

function validateEnv() {
  const required = ["ASANA_TOKEN", "ASANA_WORKSPACE_GID"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("❌ Missing required env vars:", missing.join(", "));
    process.exit(1);
  }
}

async function run() {
  const now = new Date();
  console.log(`\n🚀 Cost per Asset Report — ${now.toLocaleString("en-NZ")}`);
  try {
    console.log("\n[1/2] Fetching Asana data...");
    const data = await fetchReportData();
    console.log(`   ↳ ${data.members.length} members · ${data.totals.taskCount} completed tasks · ${data.totals.missingFieldsCount} missing fields`);

    console.log("\n[2/2] Generating HTML report...");
    const html = generateHtml(data);
    const reportPath = saveReport(html, now);
    console.log(`   ↳ Saved to: ${reportPath}`);

    console.log(`\n✅ Done — ${now.toLocaleString("en-NZ")}\n`);
  } catch (err) {
    console.error("\n❌ Report failed:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

validateEnv();
run();
