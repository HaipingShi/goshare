import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Execute the actual migration and SQL used by the Worker, with D1's transactional batch contract.
export function quotaDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../migrations/0006_add_daily_usage.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../../migrations/0007_add_ai_budget.sql', import.meta.url), 'utf8'));
  function statement(sql, args = []) {
    return {
      sql, args,
      bind(...values) { return statement(sql, values); },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async run() { const result = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: result.changes } }; },
    };
  }
  return {
    sqlite, prepare: statement,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map(({ sql, args }) => {
          const executed = sqlite.prepare(sql).run(...args);
          return { success: true, meta: { changes: executed.changes } };
        });
        sqlite.exec('COMMIT');
        return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
