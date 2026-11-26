/**
 * DRAQON sandbox policy boundary. Callers must supply identity, asset scope,
 * classification, approvals, clock and tariff from authenticated server-side
 * records. A model may propose only the five fields in COMMAND_FIELDS.
 */
import { createHash } from 'node:crypto';

const COMMAND_FIELDS = ['taskId', 'action', 'targetId', 'revision', 'description'];
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/;
export const isIdentifier = value => typeof value === 'string' && identifier.test(value);
export const actions = Object.freeze({
  observe:          { level: 0, receipt: 'observation', model: false },
  recommend:        { level: 1, receipt: 'recommendation', model: true },
  prepare_draft:    { level: 2, receipt: 'draft', model: true },
  create_work_order:{ level: 3, receipt: 'work_order', approval: true },
  close_work_order: { level: 3, receipt: 'closure', approval: true, visit: true },
  schedule_reminder:{ level: 4, receipt: 'schedule', routine: true },
  propose_improvement:{ level: 5, receipt: 'sandbox_report', isolated: true },
});
for (const rule of Object.values(actions)) Object.freeze(rule);

function invalidCommand(command) {
  return !command || Object.getPrototypeOf(command) !== Object.prototype ||
    Object.keys(command).length !== COMMAND_FIELDS.length ||
    COMMAND_FIELDS.some(key => !Object.hasOwn(command, key)) ||
    !isIdentifier(command.taskId) || !isIdentifier(command.targetId) ||
    !Number.isSafeInteger(command.revision) || command.revision < 1 ||
    typeof command.description !== 'string' || !command.description.trim() ||
    command.description.length > 4000;
}
export function textFingerprint(text) {
  return createHash('sha256').update(text).digest('hex');
}
export function fingerprint(command) {
  return createHash('sha256').update(JSON.stringify(COMMAND_FIELDS.map(key => command[key]))).digest('hex');
}
const deny = code => ({ allowed: false, code });
const validMoney = value => Number.isSafeInteger(value) && value >= 0;
export { validMoney };

export function assess(command, trust, now) {
  if (invalidCommand(command)) return deny('INVALID_COMMAND');
  if (typeof command.action !== 'string' || !Object.hasOwn(actions, command.action)) return deny('ACTION_DENIED');
  if (!Number.isSafeInteger(now) || now < 0 || !trust) return deny('CONTEXT_REQUIRED');
  const {subject, resource, approval, review} = trust;
  if (!subject || !isIdentifier(subject.tenantId) || !isIdentifier(subject.actorId) ||
      !Array.isArray(subject.allowedActions) || !subject.allowedActions.includes(command.action) ||
      !Number.isInteger(subject.maxLevel) || subject.maxLevel < 0 || subject.maxLevel > 5)
    return deny('IDENTITY_OR_PERMISSION');
  if (!resource || resource.tenantId !== subject.tenantId || resource.id !== command.targetId)
    return deny('TENANT_OR_RESOURCE');
  const rule = actions[command.action];
  if (subject.maxLevel < rule.level) return deny('LEVEL_DENIED');
  if (!['low','medium','high','reserved'].includes(resource.risk)) return deny('RISK_UNCLASSIFIED');
  if (!['public','internal','restricted'].includes(resource.dataClass)) return deny('DATA_UNCLASSIFIED');
  if (resource.risk === 'reserved' && rule.level >= 3) return deny('FOUNDER_RESERVED');
  if (rule.model && !(resource.dataClass === 'public' || (resource.dataClass === 'internal' && trust.minimized === true)))
    return deny('MODEL_DATA_DENIED');
  // Resource classification alone cannot clear arbitrary request text for
  // model egress. Bind the exact minimized text to a trusted input assessment.
  if (rule.model) {
    const egress=trust.inputReview;
    if (!egress || egress.tenantId !== subject.tenantId || egress.textDigest !== textFingerprint(command.description) ||
        !['public','internal'].includes(egress.dataClass) || (egress.dataClass === 'internal' && trust.minimized !== true) ||
        egress.cleared !== true ||
        !isIdentifier(egress.id) || !Number.isSafeInteger(egress.issuedAt) || egress.issuedAt > now ||
        !Number.isSafeInteger(egress.expiresAt) || egress.expiresAt <= now)
      return deny('INPUT_NOT_CLEARED');
  }
  if (rule.routine && (resource.risk !== 'low' || trust.routineAllowlisted !== true)) return deny('NOT_ROUTINE');
  if (rule.isolated && trust.environment !== 'sandbox') return deny('SANDBOX_ONLY');
  if (trust.environment !== 'sandbox' && trust.environment !== 'pilot') return deny('ENVIRONMENT_DENIED');
  if (!validMoney(trust.maxCostMinor)) return deny('COST_UNAVAILABLE');
  const digest = fingerprint(command);
  function bound(record) {
    return record && record.tenantId === subject.tenantId && record.digest === digest &&
      Number.isSafeInteger(record.issuedAt) && record.issuedAt <= now &&
      Number.isSafeInteger(record.expiresAt) && record.expiresAt > now && isIdentifier(record.id);
  }
  if ((resource.risk === 'high' && rule.level > 0) || trust.reviewRequired === true) {
    if (!bound(review) || review.status !== 'accepted' || !isIdentifier(review.evidenceId) ||
        !isIdentifier(review.reviewerId) || review.reviewerId === subject.actorId)
      return deny('REVIEW_REQUIRED');
  }
  if (rule.approval) {
    if (!bound(approval) || approval.decision !== 'approved' || !isIdentifier(approval.approverId) ||
        approval.approverId === subject.actorId || approval.role !== 'authorized_approver' ||
        !validMoney(approval.limitMinor) || approval.limitMinor < trust.maxCostMinor)
      return deny('APPROVAL_REQUIRED');
  }
  if (rule.visit && !(resource.status === 'in_progress' && resource.visit?.tenantId === subject.tenantId &&
      resource.visit.targetId === resource.id && isIdentifier(resource.visit.id) && resource.visit.verified === true))
    return deny('VERIFIED_VISIT_REQUIRED');
  return { allowed:true, code:'AUTHORIZED', digest, level:rule.level, receiptType:rule.receipt,
    approvalId:rule.approval ? approval.id : null,
    reviewId:((resource.risk === 'high' && rule.level > 0) || trust.reviewRequired === true) ? review.id : null };
}

