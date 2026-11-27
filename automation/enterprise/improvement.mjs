/** Summarise failed synthetic checks for human review. Never execute or publish evidence payloads. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const hash = text => createHash("sha256").update(text).digest("hex");
function label(value) {
  return String(value).replace(/[^\p{L}\p{N} _.:/-]/gu, "").trim().slice(0, 120);
}
export function regressionProposal(tap, memory, status) {
  if (!status || ![status.install, status.node, status.memory].every(Number.isInteger)) {
    throw new Error("Incomplete suite exit status");
  }
  const failures = new Set();
  if (status.install !== 0) failures.add("install: npm ci failed");
  if (status.node !== 0) {
    const matches = [...tap.matchAll(/^\s*not ok \d+ - ([^\r\n]+)/gm)];
    if (matches.length === 0) failures.add("node: runner failed before a case result");
    for (const match of matches) failures.add("node: " + (label(match[1]) || "unnamed case"));
  } else if (!/^# fail 0$/m.test(tap)) throw new Error("Incomplete Node evidence");
  const rows = memory?.cases;
  const complete = Array.isArray(rows) && rows.length > 0 && rows.every(row => typeof row.id === "string" && ["PASS","FAIL"].includes(row.status));
  if (status.memory !== 0) {
    const failed = complete ? rows.filter(row => row.status === "FAIL") : [];
    if (!failed.length) failures.add("memory: runner failed before a case result");
    for (const row of failed) failures.add("memory: " + (label(row.id) || "unnamed case"));
  } else if (!complete || rows.some(row => row.status !== "PASS")) throw new Error("Incomplete memory evidence");
  if (!failures.size) return null;
  const ids = [...failures].sort();
  const digest = hash(ids.join("\n")).slice(0,16);
  return { digest, markdown: [
    "# DRAQON regression review", "", "Failure signature: " + digest,
    "Evidence digest: " + hash(JSON.stringify({tap,memory,status})), "",
    ...ids.map(id => "- " + id), "",
    "Owner: engineering. Inspect the retained CI artifact and reproduce each finding in an isolated checkout.",
    "Submit a scoped fix and rerun the failing cases and the full suite. Independent review must check acceptance evidence.",
    "The proposal records evidence only. Policy, budgets, permissions, rollout and rollback require their designated owners."
  ].join("\n") + "\n"};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , evidence, target] = process.argv;
  const status = JSON.parse(readFileSync(join(evidence,"status.json"),"utf8"));
  const tap = readFileSync(join(evidence,"node.tap"),"utf8");
  let memory = null;
  try { memory = JSON.parse(readFileSync(join(evidence,"memory.json"),"utf8")); }
  catch (error) { if (status.memory === 0) throw error; }
  const result = regressionProposal(tap, memory, status);
  if (result) {
    writeFileSync(target, result.markdown);
    process.stdout.write(result.digest);
  }
}
