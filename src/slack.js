// src/slack.js — posts summary + HTML report to Slack

const { WebClient } = require("@slack/web-api");
const fs   = require("fs");
const path = require("path");

function fmtNZD(n) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency", currency: "NZD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}
function fmt(n, d = 0) {
  return new Intl.NumberFormat("en-NZ", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(n);
}

async function postToSlack(data, reportFilePath, dryRun = false) {
  const { totals, members, generatedAt } = data;

  const dayStr  = generatedAt.toLocaleDateString("en-NZ", { weekday: "long" });
  const dateStr = generatedAt.toLocaleDateString("en-NZ", {
    day: "numeric", month: "long", year: "numeric",
  });

  const globalCPA = totals.totalAssets > 0
    ? fmtNZD(totals.totalCostNZD / totals.totalAssets)
    : "—";

  const summary = [
    `📲 *XCF Cost per Asset Report — ${dayStr} ${dateStr}*`,
    ``,
    `*Portfolio Overview*`,
    `📦  Total pipeline cost: *${fmtNZD(totals.totalCostNZD)}*  (${fmt(totals.totalHours, 0)}h / ${fmt(totals.totalAssets)} assets)`,
    `🎯  Avg cost per asset: *${globalCPA}*`,
    `📅  Cost today: *${fmtNZD(totals.costToday)}*  (${fmt(totals.hoursToday, 1)}h)`,
    `📆  Next 7 days: *${fmtNZD(totals.costNext7)}*`,
    `🗓️  Next 21 days: *${fmtNZD(totals.costNext21)}*`,
    ``,
    `*Team Status*`,
    `👥  ${totals.memberCount} active team members across ${totals.projectCount} project(s)`,
    `🔴  ${totals.overCapacityCount} over capacity (>8h today)`,
    `🟢  ${totals.availableCount} available (<3h today)`,
    `⚠️  ${totals.overdueCount} overdue tasks`,
    `🟡  ${totals.missingFieldsCount} tasks missing fields`,
  ].join("\n");

  const topCost = members.slice(0, 4).map((m) => {
    const cpa = m.totalAssets > 0 ? fmtNZD(m.totalCostNZD / m.totalAssets) : "—";
    return `  • ${m.name}: *${fmtNZD(m.totalCostNZD)}*  (${fmt(m.totalAssets)} assets · ${cpa}/asset)`;
  }).join("\n");

  const fullMessage = summary
    + (members.length > 0 ? `\n\n*Top cost assets by person*\n${topCost}` : "")
    + `\n\n_Rate: $${process.env.DEFAULT_MINUTE_RATE || "2.33"} NZD/min (~$${fmt(parseFloat(process.env.DEFAULT_MINUTE_RATE || "2.33") * 60, 0)}/hr)_`
    + `\n\nFull interactive report attached →`;

  if (dryRun) {
    console.log("\n── DRY RUN: Slack message ──────────────────────────────────\n");
    console.log(fullMessage);
    console.log(`\n── Report file: ${reportFilePath}\n`);
    return;
  }

  const slack = new WebClient(process.env.SLACK_TOKEN);
  const channel = process.env.SLACK_CHANNEL_ID;

  console.log("📨 Posting summary to Slack...");
  await slack.chat.postMessage({ channel, text: fullMessage, mrkdwn: true });

  console.log("📎 Uploading HTML report...");
  await slack.filesUploadV2({
    channel_id: channel,
    filename: path.basename(reportFilePath),
    file: fs.readFileSync(reportFilePath),
    title: `XCF Cost per Asset — ${dateStr}`,
    initial_comment: "📖 Open in your browser for the full interactive report.",
  });

  console.log("✅ Posted to Slack.");
}

module.exports = { postToSlack };
