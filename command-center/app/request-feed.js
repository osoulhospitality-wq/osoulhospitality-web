// Status labels describe the public drafting queue. Field acceptance lives in the private FM portal.
export const feedLabels = ["dragon-task", "dragon-processing", "dragon-completed", "dragon-failed"];

export const labelNames = issue => (issue.labels || []).map(label => typeof label === "string" ? label : label.name);

export function scopeOf(issue) {
  const labels = labelNames(issue);
  const title = issue.title || "";
  const legacyPilot = /^\[LIVE-START\b|^Dragon Production Health Check|^Dragon (?:Intake |Production )?Acceptance|^Test Dragon Task|^Dragon (?:E2E|QA)\b|^\[QA\]|^QA\s*[—:-]/i.test(title);
  const pilotBody = /بيانات تجريبية مصطنعة|^Synthetic (?:internal production acceptance test|acceptance check)\b|^- (?:Source|مصدر الطلب): Osoul Command Center v/im.test(issue.body || "");
  if (labels.some(label => ["qa", "dragon-qa", "dragon-test"].includes(label)) || legacyPilot || pilotBody) return "pilot";
  if (labels.includes("dragon-operational")) return "operational";
  return "unclassified";
}

export function matchesScope(issue, selected) {
  return selected === "all" || (selected === "queue" ? scopeOf(issue) !== "pilot" : scopeOf(issue) === selected);
}

export function mergeFeeds(feeds) {
  const issues = new Map();
  for (const issue of feeds.flat()) {
    if (issue.pull_request || !Number.isInteger(issue.number)) continue;
    const previous = issues.get(issue.number);
    if (!previous || Date.parse(issue.updated_at) > Date.parse(previous.updated_at)) issues.set(issue.number, issue);
  }
  return [...issues.values()];
}

export function terminalShare(counts) {
  const total = counts.completed + counts.failed + counts.conflict;
  return total ? Math.round(100 * counts.completed / total) : null;
}
