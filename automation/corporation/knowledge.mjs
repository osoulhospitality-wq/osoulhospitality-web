// Only structured, aggregate-safe facts for the two implemented internal analyses.
import { createHash } from 'node:crypto';

export function identifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(value);
}

export function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) {
    throw new Error('Expected UTC ISO timestamp');
  }
  const date = new Date(value);
  const expected = value.includes('.') ? value : value.slice(0, -1) + '.000Z';
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== expected) {
    throw new Error('Invalid calendar timestamp');
  }
  return date.toISOString();
}

function validateFields(row, names) {
  if (!row || typeof row !== 'object' || Array.isArray(row) ||
      Object.keys(row).sort().join(',') !== [...names].sort().join(',')) {
    throw new Error('Unexpected or missing evidence fields');
  }
}

function integer(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Expected nonnegative safe integer');
  return value;
}

function checkedId(value) {
  if (!identifier(value)) throw new Error('Invalid evidence identifier');
  return value;
}

function validateOrder(row) {
  validateFields(row, ['id', 'due', 'state']);
  if (!['open', 'closed'].includes(row.state)) throw new Error('Unknown work-order state');
  return { id: checkedId(row.id), due: row.due === null ? null : timestamp(row.due), state: row.state };
}

function validateCost(row) {
  validateFields(row, ['id', 'actualHalala', 'budgetHalala']);
  return { id: checkedId(row.id), actualHalala: integer(row.actualHalala), budgetHalala: integer(row.budgetHalala) };
}

export const DATASETS = Object.freeze({
  work_orders: Object.freeze({ producer: 'COO', reviewer: 'CQO', validate: validateOrder }),
  sar_budget: Object.freeze({ producer: 'CFO', reviewer: 'CQO', validate: validateCost }),
});

export function prepareSnapshot(snapshot, now) {
  validateFields(snapshot, ['kind', 'reference', 'observedAt', 'expiresAt', 'rows']);
  const { kind, reference, observedAt, expiresAt, rows } = snapshot;
  if (!Object.hasOwn(DATASETS, kind) || !identifier(reference)) throw new Error('Invalid source type or reference');
  const observed = timestamp(observedAt);
  const expires = timestamp(expiresAt);
  if (observed > now || expires <= now) throw new Error('Future or expired snapshot');
  if (!Array.isArray(rows) || rows.length > 10000) throw new Error('Invalid row count');
  const records = rows.map(DATASETS[kind].validate).sort((a, b) => a.id < b.id ? -1 : Number(a.id > b.id));
  if (new Set(records.map(row => row.id)).size !== records.length) throw new Error('Duplicate evidence row');
  return { kind, reference, observedAt: observed, expiresAt: expires, rows: records };
}

export function analyse(snapshot) {
  if (snapshot.kind === 'work_orders') {
    const open = snapshot.rows.filter(row => row.state === 'open');
    const overdue = open.filter(row => row.due !== null && row.due < snapshot.observedAt);
    return { total: snapshot.rows.length, open: open.length, overdue: overdue.length,
      missingDue: open.filter(row => row.due === null).length,
      oldestOverdueMinutes: overdue.length ? Math.floor((Date.parse(snapshot.observedAt) -
        Math.min(...overdue.map(row => Date.parse(row.due)))) / 60000) : null };
  }
  if (snapshot.kind !== 'sar_budget') throw new Error('Unsupported analysis');
  let actual = 0, budget = 0;
  for (const row of snapshot.rows) {
    actual = integer(actual + row.actualHalala);
    budget = integer(budget + row.budgetHalala);
  }
  return { currency: 'SAR', lines: snapshot.rows.length, actualHalala: actual,
    budgetHalala: budget, varianceHalala: actual - budget };
}
