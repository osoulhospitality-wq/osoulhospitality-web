// Trusted local application entry. The host authenticates the actor and supplies
// its scoped evidence index. Never expose this helper as an authorization endpoint.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getAgent } from './registry.mjs';
import { Operations } from './operations.mjs';
import { identifier, timestamp, digest } from './knowledge.mjs';

import { facilityCouncil } from './facility-council.mjs';
export { facilityCouncil };

const byTopic = new Map(facilityCouncil.map(rule => [rule.topic, rule]));

const sensitiveDecisions = new Map([
  ['pay', 'human.owner_or_finance_delegate'], ['sign_contract', 'human.authorized_signatory'],
  ['change_access', 'human.security_authority'], ['release', 'human.release_authority'],
  ['accept_field_work', 'human.independent_field_inspector'], ['critical_intervention', 'human.site_emergency_authority'],
]);

export function prepareAssignment(task, host) {
  if (!task || !host || !identifier(task.id) || !identifier(host.tenant) || !identifier(host.facility) ||
      !Array.isArray(host.evidence)) throw new Error('A scoped task and an evidence index are required');
  const rule = byTopic.get(task.topic);
  if (!rule || !['observe', 'prepare'].includes(task.intent) && !sensitiveDecisions.has(task.intent))
    throw new Error('Unsupported facility assignment');
  const asOf = timestamp(host.asOf);
  const lead = getAgent(rule.lead);
  const visible = host.evidence.filter(row => row?.tenant === host.tenant && row.facility === host.facility);
  const references = [], missing = [];
  for (const type of rule.evidence) {
    const current = visible.filter(row => {
      if (row.type !== type || !identifier(row.reference)) return false;
      return timestamp(row.observedAt) <= asOf && asOf < timestamp(row.expiresAt);
    }).map(row => ({ type, reference: row.reference, observedAt: timestamp(row.observedAt), expiresAt: timestamp(row.expiresAt) }));
    current.sort((a, b) => a.reference.localeCompare(b.reference) || a.observedAt.localeCompare(b.observedAt) || a.expiresAt.localeCompare(b.expiresAt));
    if (current.length) references.push(...current);
    else missing.push(type);
  }
  const approver = sensitiveDecisions.get(task.intent) ?? null;
  const state = missing.length ? 'awaiting_evidence' : approver ? 'awaiting_human_authorization' : 'prepared';
  const packet = {
    id: task.id, tenant: host.tenant, facility: host.facility, asOf, topic: rule.topic, intent: task.intent,
    coordinator: 'COS', producer: lead.id, reviewer: rule.reviewer, approver, state,
    escalateTo: approver ?? lead.escalation, output: lead.outputs[0], measure: lead.kpis[0],
    references, missing,
  };
  return { ...packet, fingerprint: digest(packet) };
}

// Only these two topics have shipped deterministic calculators. The others
// yield preparation packets even when the evidence index is complete.
export function runAnalysis(operations, task, host, source, version) {
  const packet = prepareAssignment(task, host);
  const dataset = {operations:'work_orders', finance:'sar_budget'}[packet.topic];
  if (!dataset || packet.state !== 'prepared' || packet.intent !== 'observe')
    throw new Error('This task does not have an authorized observation workflow');
  // The facility-scoped source key also binds the ledger snapshot to the packet.
  if (source !== host.facility + '.' + dataset || !identifier(source) || !Number.isSafeInteger(version) || version < 1)
    throw new Error('Facility evidence version required');
  return operations.produceScopedObservation(packet, dataset, source, version);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const command = process.argv[2];
    if (command === 'list') console.log(JSON.stringify(facilityCouncil, null, 2));
    else if (command === 'prepare') {
      const {task, host} = JSON.parse(readFileSync(0, 'utf8'));
      console.log(JSON.stringify(prepareAssignment(task, host), null, 2));
    } else if (command === 'observe' && process.argv[3]) {
      const {task, host, source, version} = JSON.parse(readFileSync(0, 'utf8'));
      const db = new Operations(process.argv[3], host.tenant);
      try { console.log(JSON.stringify(runAnalysis(db, task, host, source, version), null, 2)); }
      finally { db.close(); }
    } else throw new Error('Usage: node facility-routing.mjs list | prepare | observe DATABASE (JSON on stdin)');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
