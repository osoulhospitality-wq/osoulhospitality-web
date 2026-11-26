import assert from "node:assert/strict";
import fs from "node:fs";

const workflowPath = new URL("../n8n/dragon-intake-production.workflow.json", import.meta.url);
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));

function runCode(nodeName, json, executionId = "test-execution") {
  const code = nodes.get(nodeName)?.parameters?.jsCode;
  assert.ok(code, `Missing code node: ${nodeName}`);
  return new Function("$json", "$execution", "$vars", code)(json, { id: executionId }, {
    DRAQON_GITHUB_OWNER: "staging-owner", DRAQON_GITHUB_REPOSITORY: "staging-repository",
    DRAQON_ALLOWED_SENDER: "staging-owner"
  })[0].json;
}

function payload({
  action = "opened",
  labels = ["dragon-task"],
  addedLabel = null,
  sender = "staging-owner",
  state = "open",
  updatedAt = "2026-07-27T12:00:00Z",
} = {}) {
  return {
    body: {
      action,
      sender: { login: sender },
      label: addedLabel ? { name: addedLabel } : undefined,
      repository: {
        full_name: "staging-owner/staging-repository",
        owner: { login: "staging-owner" },
        name: "staging-repository",
      },
      issue: {
        number: 25,
        state,
        title: "Acceptance",
        body: "Test",
        updated_at: updatedAt,
        labels: labels.map((name) => ({ name })),
        user: { login: sender },
      },
    },
  };
}

function classify(input, executionId) {
  const authorized = runCode("Authorize & Classify", input, executionId);
  return runCode("Stabilize Command Version", authorized, executionId);
}

// Structural import safety.
assert.equal(workflow.active, false, "Export must remain inactive before live acceptance");
assert.equal(new Set(workflow.nodes.map((node) => node.name)).size, workflow.nodes.length);
for (const [source, outputs] of Object.entries(workflow.connections)) {
  assert.ok(nodes.has(source), `Connection source does not exist: ${source}`);
  for (const output of Object.values(outputs).flat(2)) {
    if (output?.node) assert.ok(nodes.has(output.node), `Connection target does not exist: ${output.node}`);
  }
}

// n8n resolves the model against the agent's language-model input port.
assert.deepEqual(workflow.connections["OpenAI Chat Model"].ai_languageModel, [[{
  node: "Dragon Intake Assistant", type: "ai_languageModel", index: 0,
}]]);

// Event and authorization matrix.
assert.equal(classify(payload()).decision, "proceed");
assert.equal(classify(payload({ labels: [] })).decision, "ignored");
assert.equal(
  classify(payload({ action: "labeled", addedLabel: "dragon-task" })).decision,
  "proceed",
);
assert.equal(
  classify(payload({ action: "labeled", addedLabel: "priority-high" })).decision,
  "ignored",
);
assert.equal(classify(payload({ sender: "external-user" })).decision, "unauthorized");
assert.equal(
  classify(payload({ labels: ["dragon-task", "dragon-completed"] })).decision,
  "ignored",
);
assert.equal(
  classify(payload({ action: "reopened", labels: ["dragon-task", "dragon-completed"] })).decision,
  "ignored",
);
assert.equal(
  classify(payload({ action: "reopened", labels: ["dragon-task"] })).decision,
  "proceed",
);
assert.equal(classify(payload({ action: "edited" })).decision, "ignored");

const foreignRepo = payload();
foreignRepo.body.repository.full_name = "synthetic/unrelated";
assert.equal(classify(foreignRepo).decision, "unauthorized");
assert.throws(() => new Function("$json","$execution","$vars",nodes.get("Authorize & Classify").parameters.jsCode)(
  payload(), {id:"fixture"}, {}), /MISSING_ENVIRONMENT_SCOPE/);

// Initial opened+labeled deliveries must converge on one atomic key.
const opened = classify(payload({ action: "opened", updatedAt: "2026-07-27T12:00:00Z" }), "a");
const labeled = classify(
  payload({
    action: "labeled",
    addedLabel: "dragon-task",
    updatedAt: "2026-07-27T12:00:02Z",
  }),
  "b",
);
assert.equal(opened.idempotencyKey, labeled.idempotencyKey);
assert.match(opened.idempotencyKey, /@initial$/);

// A deliberate reopen creates a new cycle; a redelivery of that event does not.
const retryA = classify(
  payload({ action: "reopened", updatedAt: "2026-07-27T13:00:00Z" }),
  "c",
);
const retryB = classify(
  payload({ action: "reopened", updatedAt: "2026-07-27T13:00:00Z" }),
  "d",
);
assert.notEqual(retryA.idempotencyKey, opened.idempotencyKey);
assert.equal(retryA.idempotencyKey, retryB.idempotencyKey);

// Simulate the UNIQUE lock: only the first execution owns each key.
const locks = new Set();
const acquire = (key) => (locks.has(key) ? false : (locks.add(key), true));
assert.equal(acquire(opened.idempotencyKey), true);
assert.equal(acquire(labeled.idempotencyKey), false);
assert.equal(acquire(retryA.idempotencyKey), true);
assert.equal(acquire(retryB.idempotencyKey), false);

// Critical production controls.
const lockNode = nodes.get("Acquire Lock");
assert.equal(
  lockNode.parameters.headerParameters.parameters.find((h) => h.name === "Prefer").value,
  "return=representation,resolution=ignore-duplicates",
);
assert.equal(lockNode.parameters.options.response.response.fullResponse, true);
assert.match(lockNode.parameters.url, /on_conflict=repository,issue_number,command_version/);
assert.match(nodes.get("Post Delivery").parameters.body, /مخرج آلي أولي/);
assert.match(nodes.get("Post Failure").parameters.body, /مخرج آلي أولي/);
assert.doesNotMatch(JSON.stringify(workflow), /(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})/);


function connectionTargets(nodeName, outputIndex = 0) {
  return (workflow.connections[nodeName]?.main?.[outputIndex] ?? []).map((edge) => edge.node);
}

// A clean eligible issue has no Dragon status labels. Do not call DELETE on
// labels that are known to be absent: GitHub returns 404 and would abort n8n.
for (const obsolete of [
  "Clear Status (pre-processing) 1",
  "Clear Status (pre-processing) 2",
  "Clear Status (pre-processing) 3",
  "Clear Status (completed) 2",
  "Clear Status (failed) 2",
]) {
  assert.equal(nodes.has(obsolete), false, `Obsolete unsafe label-clear node remains: ${obsolete}`);
}
assert.deepEqual(connectionTargets("Lock Acquired?"), ["Add dragon-processing"]);

// Ambiguous comment writes stay available for operator reconciliation.
assert.deepEqual(connectionTargets("Add dragon-processing", 1), ["Finalize Lock: failed"]);
assert.deepEqual(connectionTargets("Post Acceptance", 1), ["Reconciliation required"]);
assert.deepEqual(connectionTargets("Normalize Delivery", 1), ["Post Failure"]);
assert.deepEqual(connectionTargets("Post Delivery", 1), ["Reconciliation required"]);
assert.deepEqual(connectionTargets("Post Failure", 1), ["Finalize Lock: failed"]);

// The lock becomes terminal before best-effort label reconciliation, preventing
// permanent processing rows when a later GitHub label mutation fails.
assert.deepEqual(connectionTargets("Post Delivery"), ["Finalize Lock: completed"]);
assert.deepEqual(connectionTargets("Post Failure"), ["Finalize Lock: failed"]);
assert.deepEqual(connectionTargets("Finalize Lock: completed"), ["Verify terminal row: completed"]);
assert.deepEqual(connectionTargets("Finalize Lock: failed"), ["Verify terminal row: failed"]);
assert.deepEqual(connectionTargets("Clear Status (completed) 1"), ["Add dragon-completed"]);
assert.deepEqual(connectionTargets("Clear Status (completed) 1", 1), ["Add dragon-completed"]);
assert.deepEqual(connectionTargets("Clear Status (failed) 1"), ["Add dragon-failed"]);
assert.deepEqual(connectionTargets("Clear Status (failed) 1", 1), ["Add dragon-failed"]);

for (const externalNode of [
  "Log Decision",
  "Acquire Lock",
  "Add dragon-processing",
  "Read Lock Owner",
  "Finalize Lock: completed",
  "Finalize Lock: failed",
]) {
  assert.equal(nodes.get(externalNode)?.retryOnFail, true, `${externalNode} must retry transient failures`);
  assert.ok((nodes.get(externalNode)?.maxTries ?? 0) >= 3, `${externalNode} must retry at least three times`);
}

console.log("PASS: Dragon workflow structural, policy, idempotency, retry, and safety tests");

for (const name of ["Post Acceptance", "Post Delivery", "Post Failure"]) {
  assert.notEqual(nodes.get(name).retryOnFail, true, "Non-idempotent comment writes require reconciliation: " + name);
}

await import("./dragon-candidate.cases.mjs");
