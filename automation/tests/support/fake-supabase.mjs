// In-memory stand-in for the subset of the Supabase query builder used by the owner desk.
// It applies real filters, ordering, ranges and exact counts to synthetic rows, so readers
// are tested against the same query semantics rather than canned responses.

const getPath = (row, path) => path.split(".").reduce((value, key) => {
  if (Array.isArray(value)) return value[0]?.[key];
  return value?.[key];
}, row);

const isNullish = value => value === null || value === undefined || (Array.isArray(value) && value.length === 0);

export function fakeSupabase(tables, {failTables = [], failOnce = []} = {}) {
  const requests = [];
  const failures = new Set(failTables);
  const pending = new Map(failOnce.map(name => [name, 1]));
  return {
    requests,
    from(name) {
      const state = {table: name, filters: [], orders: [], range: null, limit: null, select: null, count: null, head: false};
      const request = {table: name, calls: []};
      requests.push(request);
      const builder = {
        select(columns, options = {}) { state.select = columns; state.count = options.count ?? null; state.head = !!options.head; request.calls.push(["select", columns, options]); return builder; },
        eq(column, value) { state.filters.push(row => getPath(row, column) === value); request.calls.push(["eq", column, value]); return builder; },
        is(column, value) { state.filters.push(row => value === null ? isNullish(getPath(row, column)) : getPath(row, column) === value); request.calls.push(["is", column, value]); return builder; },
        lt(column, value) { state.filters.push(row => getPath(row, column) < value); request.calls.push(["lt", column, value]); return builder; },
        lte(column, value) { state.filters.push(row => getPath(row, column) <= value); request.calls.push(["lte", column, value]); return builder; },
        gte(column, value) { state.filters.push(row => getPath(row, column) >= value); request.calls.push(["gte", column, value]); return builder; },
        in(column, values) { state.filters.push(row => values.includes(getPath(row, column))); request.calls.push(["in", column, values]); return builder; },
        order(column) { state.orders.push(column); request.calls.push(["order", column]); return builder; },
        limit(n) { state.limit = n; request.calls.push(["limit", n]); return builder; },
        range(from, to) { state.range = [from, to]; request.calls.push(["range", from, to]); return builder; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (failures.has(name)) throw new Error("offline: " + name);
            if (pending.get(name)) { pending.set(name, pending.get(name) - 1); throw new Error("transient: " + name); }
            let rows = (tables[name] || []).filter(row => state.filters.every(test => test(row)));
            const total = rows.length;
            for (const column of [...state.orders].reverse()) {
              rows = [...rows].sort((a, b) => {
                const x = getPath(a, column), y = getPath(b, column);
                return x < y ? -1 : x > y ? 1 : 0;
              });
            }
            if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
            if (state.limit !== null) rows = rows.slice(0, state.limit);
            const result = state.count === "exact" ? {count: total} : {};
            if (!state.head) result.data = rows;
            result.error = null;
            return result;
          }).then(resolve, reject);
        }
      };
      return builder;
    }
  };
}
