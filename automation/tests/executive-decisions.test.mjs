import test from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase } from "./support/fake-supabase.mjs";
globalThis.document = {documentElement:{lang:"en-SA"}};
const {readExecutiveOverview, readOverduePlanPage, decisionItems, decisionSummary, periodInRiyadh} =
  await import("../../command-center/enterprise/src/executive-overview.js");

const today = "2026-11-28";
const period = {today, first: "2026-11-01"};
const asset = {asset_code: "HVAC-3", name: "Chiller 3"};
// Synthetic rows only: 12 overdue active plans in site-a, plus paused, future, other-site and other-org rows.
const overdueRows = Array.from({length: 12}, (_, i) => ({
  id: "plan-" + String(i + 1).padStart(2, "0"), organization_id: "org-a", facility_id: "site-a",
  task: "Filter service " + (i + 1), next_due_on: "2026-11-" + String(1 + (i % 20)).padStart(2, "0"),
  paused_at: null, source_reference: "SRC-" + i, facility_assets: asset
}));
const tables = {
  facility_pm_plans: [
    ...overdueRows,
    {id: "plan-paused", organization_id: "org-a", facility_id: "site-a", task: "Paused", next_due_on: "2026-10-01", paused_at: "2026-10-02", facility_assets: asset},
    {id: "plan-future", organization_id: "org-a", facility_id: "site-a", task: "Future", next_due_on: "2026-12-05", paused_at: null, facility_assets: asset},
    {id: "plan-other-site", organization_id: "org-a", facility_id: "site-b", task: "Other site", next_due_on: "2026-10-01", paused_at: null, facility_assets: asset},
    {id: "plan-other-org", organization_id: "org-b", facility_id: "site-a", task: "Other org", next_due_on: "2026-10-01", paused_at: null, facility_assets: asset}
  ],
  facility_pm_occurrences: [],
  field_form_records: []
};

test("count of overdue plans from the real reader equals the register total under the same filter", async () => {
  const client = fakeSupabase(tables);
  const overview = await readExecutiveOverview(client, "org-a", "site-a", period);
  assert.equal(overview.waiting, 12, "paused, future, other-site and other-org plans are excluded");
  const page = await readOverduePlanPage(client, "org-a", "site-a", today, 0);
  assert.equal(page.count, 12);
  assert.equal(page.data.length, 10, "register page size is the declared limit");
  assert.deepEqual(page.data.slice(0, 2).map(row => row.id), ["plan-01", "plan-02"]);
  const second = await readOverduePlanPage(client, "org-a", "site-a", today, 10);
  assert.equal(second.data.length, 2);
  assert.equal(second.count, 12);
  const dates = page.data.map(row => row.next_due_on);
  assert.deepEqual(dates, [...dates].sort(), "oldest due date first");
  assert.ok(!page.data.some(row => row.id.startsWith("plan-paused") || row.id === "plan-future" || row.id === "plan-other-site" || row.id === "plan-other-org"));
});

test("positive count from the reader reaches the decision card as a decision with the register anchor", async () => {
  const items = decisionItems(await readExecutiveOverview(fakeSupabase(tables), "org-a", "site-a", period));
  const plans = items.find(item => item.anchor === "fm-overdue-plans");
  assert.equal(plans.state, "decision");
  assert.equal(plans.count, 12);
  assert.equal(decisionSummary(items, today).key, "decisions");
});

test("zero from the reader is read and clear, not unverified", async () => {
  const empty = {...tables, facility_pm_plans: []};
  const items = decisionItems(await readExecutiveOverview(fakeSupabase(empty), "org-a", "site-a", period));
  assert.ok(items.every(item => item.state === "clear" && item.count === 0));
  assert.equal(decisionSummary(items, today).key, "clear");
});

test("a failed plan source is unverified and does not hide confirmed decisions", async () => {
  const client = fakeSupabase(tables, {failTables: ["facility_pm_plans"]});
  const items = decisionItems(await readExecutiveOverview(client, "org-a", "site-a", period));
  assert.equal(items.find(item => item.anchor === "fm-overdue-plans").state, "unverified");
  const orders = items.find(item => item.anchor === "fm-overdue-orders");
  assert.equal(orders.state, "clear");
  const summary = decisionSummary(items, today);
  assert.equal(summary.key, "partial-none", "orders read clear, plans unread: must not claim a clean state");
  assert.ok(summary.text.length > 0);
});

test("when every source fails the summary says decisions could not be determined", async () => {
  const client = fakeSupabase(tables, {failTables: ["facility_pm_occurrences", "field_form_records", "facility_pm_plans"]});
  const items = decisionItems(await readExecutiveOverview(client, "org-a", "site-a", period));
  assert.ok(items.every(item => item.state === "unverified"));
  const summary = decisionSummary(items, today);
  assert.equal(summary.key, "all-failed");
  // Wording is checked by key here; Arabic copy is verified in the browser check where the locale is set.
  assert.ok(summary.text.length > 0);
});

test("facility selection reads only the selected facility", async () => {
  const siteB = {...tables, facility_pm_plans: tables.facility_pm_plans.filter(row => row.facility_id === "site-b")};
  const items = decisionItems(await readExecutiveOverview(fakeSupabase(siteB), "org-a", "site-b", period));
  assert.equal(items.find(item => item.anchor === "fm-overdue-plans").count, 1);
});

test("periodInRiyadh still anchors today in Riyadh time", () => {
  assert.equal(periodInRiyadh(new Date("2026-11-28T21:30:00Z")).today, "2026-11-29");
});
