const fs = require("fs");

const sarifPath = process.env.DT_SARIF || "deprecated-tracker.sarif";
const wantSummary = process.env.DT_SUMMARY !== "false";

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    return;
  }
  fs.appendFileSync(file, `${name}=${String(value).replace(/\r?\n/g, " ")}\n`);
}

function appendSummary(lines) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file || !wantSummary) {
    return;
  }
  fs.appendFileSync(file, `${lines.join("\n")}\n`);
}

if (!fs.existsSync(sarifPath)) {
  console.log(`::warning::no SARIF at ${sarifPath} — nothing to summarise`);
  setOutput("total", 0);
  setOutput("hidden", 0);
  setOutput("config-source", "");
  setOutput("sarif-file", sarifPath);
  process.exit(0);
}

const scanned = (process.env.DT_PATH || ".")
  .replace(/\\/g, "/")
  .replace(/^\.\//, "")
  .replace(/\/+$/, "");
const prefix = scanned === "" || scanned === "." ? "" : `${scanned}/`;

const sarif = JSON.parse(fs.readFileSync(sarifPath, "utf8"));
const run = sarif.runs[0];
const results = run.results || [];

if (prefix) {
  for (const result of results) {
    for (const location of result.locations || []) {
      const artifact =
        location.physicalLocation && location.physicalLocation.artifactLocation;
      if (artifact && artifact.uri) {
        artifact.uri = prefix + artifact.uri;
      }
    }
  }
  fs.writeFileSync(sarifPath, JSON.stringify(sarif), "utf8");
}
const provenance = run.properties || {};
const hiddenByPackage = provenance.hidden || {};
const hidden = Object.values(hiddenByPackage).reduce(
  (sum, count) => sum + count,
  0,
);

setOutput("total", results.length);
setOutput("hidden", hidden);
setOutput("config-source", provenance.configSource || "");
setOutput("sarif-file", sarifPath);

const byFile = new Map();
for (const result of results) {
  const location =
    result.locations && result.locations[0]
      ? result.locations[0].physicalLocation
      : undefined;
  const file = location ? location.artifactLocation.uri : "(unknown)";
  const line = location && location.region ? location.region.startLine : 0;
  const rows = byFile.get(file) || [];
  rows.push({ line, message: result.message.text, level: result.level });
  byFile.set(file, rows);
}

const lines = ["## Deprecated Tracker", ""];

if (results.length === 0) {
  lines.push("No deprecated APIs reported.");
} else {
  lines.push(
    `**${results.length}** finding(s) across **${byFile.size}** file(s).`,
    "",
    "| File | Line | Level | Finding |",
    "| --- | ---: | --- | --- |",
  );
  const shown = [...byFile.entries()].slice(0, 20);
  for (const [file, rows] of shown) {
    for (const row of rows.slice(0, 10)) {
      const message = row.message
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|")
        .replace(/\r\n|\r|\n/g, "<br>");
      lines.push(`| ${file} | ${row.line} | ${row.level} | ${message} |`);
    }
    if (rows.length > 10) {
      lines.push(`| ${file} | | | …${rows.length - 10} more in this file |`);
    }
  }
  if (byFile.size > shown.length) {
    lines.push(`| …${byFile.size - shown.length} more file(s) | | | |`);
  }
}

if (provenance.configSource) {
  lines.push(
    "",
    `Config: \`${provenance.configSource}\` — ${provenance.excludePatterns} exclude pattern(s), ${provenance.suppressedPackages} suppressed package(s).`,
  );
}

if (hidden > 0) {
  const named = Object.entries(hiddenByPackage)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `${name} (${count})`)
    .join(", ");
  lines.push(`**${hidden} finding(s) hidden by suppressPackages:** ${named}.`);
}

appendSummary(lines);
