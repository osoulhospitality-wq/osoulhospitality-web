// Produce a read-only shift queue. The caller loads authorised tenant records and
// authenticated acceptance receipts. Customer-provided urgency is a triage signal.
const priorities = ['immediate', 'this_shift', 'scheduled', 'backlog'];
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value);
const date = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const statuses = new Set(['open', 'in_progress', 'accepted']);
const effects = new Set(['possible_hazard', 'service_outage', 'degraded', 'routine']);
function validate(item) {
  if (!item || !id(item.id) || !id(item.tenantId) || !id(item.siteId) ||
      !statuses.has(item.status) || !effects.has(item.impact) ||
      (item.owner !== null && !id(item.owner)) || !Array.isArray(item.dependsOn) ||
      !item.dependsOn.every(id) || !Array.isArray(item.evidence) || !item.evidence.every(id) ||
      (item.dueAt !== null && !date(item.dueAt))) throw new Error('invalid_shift_record');
}
export function planShift({tenantId, siteIds, now, shiftEnd, records}) {
  if (!id(tenantId) || !Array.isArray(siteIds) || !siteIds.every(id) ||
      !date(now) || !date(shiftEnd) || Date.parse(shiftEnd) < Date.parse(now) ||
      !Array.isArray(records)) throw new Error('invalid_shift_context');
  const visible = new Set(siteIds);
  const items = records.filter(item => item?.tenantId === tenantId && visible.has(item.siteId));
  items.forEach(validate);
  const byId = new Map(items.map(item => [item.id, item]));
  if (byId.size !== items.length) throw new Error('ambiguous_shift_record');
  const queue = [];
  for (const item of items) {
    if (item.status === 'accepted' && item.evidence.length) continue;
    const due = item.dueAt === null ? Infinity : Date.parse(item.dueAt);
    const reason = item.impact === 'possible_hazard' ? 'notify_site_duty_manager' :
      item.impact === 'service_outage' ? 'service_unavailable' :
      due < Date.parse(now) ? 'past_due' : due <= Date.parse(shiftEnd) ? 'due_this_shift' :
      item.dueAt ? 'future_commitment' : 'unplanned';
    const priority = reason === 'notify_site_duty_manager' ? 'immediate' :
      ['service_unavailable','past_due','due_this_shift'].includes(reason) ? 'this_shift' :
      reason === 'future_commitment' ? 'scheduled' : 'backlog';
    const blockers = [];
    // A dependency passes only with a visible accepted result and evidence. Cycles
    // of open work remain blocked without recursion. Unknown references stay opaque.
    if (item.dependsOn.some(ref => {
      const dep = byId.get(ref);
      return !dep || dep.status !== 'accepted' || !dep.evidence.length;
    })) blockers.push('dependency_unverified');
    if (!item.owner) blockers.push('owner_required');
    if (item.status === 'accepted') blockers.push('acceptance_evidence_required');
    queue.push({id:item.id, siteId:item.siteId, owner:item.owner, priority, reason, dueAt:item.dueAt,
      blockers, evidence:[...item.evidence], disposition:priority === 'immediate' ? 'human_triage_now' :
        blockers.length ? 'needs_decision' : 'plan_work'});
  }
  const dueTime = task => task.dueAt === null ? Infinity : Date.parse(task.dueAt);
  return queue.sort((a,b) => priorities.indexOf(a.priority)-priorities.indexOf(b.priority) ||
    dueTime(a)-dueTime(b) ||
    a.id.localeCompare(b.id,'en'));
}
