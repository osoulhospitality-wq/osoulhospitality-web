import assert from "node:assert/strict";
import fs from "node:fs";

const workflowPath = new URL("../n8n/dragon-intake-production.workflow.json", import.meta.url);
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));

function runCode(nodeName, json, executionId = "test-execution") {
  const code = nodes.get(nodeName)?.parameters?.jsCode;
  assert.ok(code, `Missing code node: ${nodeName}`);
  return new Function("$json", "$execution", code)(json, { id: executionId })[0].json;
}

function payload({
  action = "opened",
  labels = ["dragon-task"],
  addedLabel = null,
  sender = "osoulhospitality-wq",
  state = "open",
  updatedAt = "2026-07-27T12:00:00Z",
} = {}) {
  return {
    body: {
      action,
      sender: { login: sender },
      label: addedLabel ? { name: addedLabel } : undefined,
      repository: {
        full_name: "osoulhospitality-wq/osoulhospitality-web",
        owner: { login: "osoulhospitality-wq" },
        name: "osoulhospitality-web",
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

console.log("PASS: Dragon workflow structural, policy, idempotency, retry, and safety tests");
