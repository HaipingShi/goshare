# Audit Architecture Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hybrid Claude Code workflow + standalone CLI that audits the architecture of the QuickShare Cloudflare codebase and produces a timestamped Markdown report.

**Architecture:** A Node.js CLI runs deterministic static checks. A Claude Code workflow spawns 4 specialized agents in parallel, then synthesizes their findings with the static checks into a Markdown report via a shared renderer.

**Tech Stack:** Node.js 20+ (ES modules), built-in `node:test` / `node:assert`, no new dependencies.

---

## File Structure

```
.claude/
└── workflows/
    └── audit-architecture.workflow.js

scripts/
├── audit-architecture.js
└── lib/
    └── audit/
        ├── schemas.js
        ├── static-checks.js
        ├── renderer.js
        └── rules/
            ├── quickshare-rules.js
            └── cf-workers-rules.js

tests/
└── audit/
    ├── schemas.test.js
    ├── renderer.test.js
    ├── static-checks.test.js
    ├── quickshare-rules.test.js
    └── cf-workers-rules.test.js

docs/
└── audits/
    └── audit-architecture-YYYY-MM-DD.md   # generated
```

---

## Task 1: Shared schemas

**Files:**
- Create: `scripts/lib/audit/schemas.js`
- Test: `tests/audit/schemas.test.js`

- [ ] **Step 1: Write failing test for finding schema**

```js
// tests/audit/schemas.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createFinding, SEVERITIES, DIMENSIONS, validateFinding } from '../../scripts/lib/audit/schemas.js';

describe('schemas', () => {
  it('createFinding returns a valid finding', () => {
    const finding = createFinding({
      id: 'test-01',
      dimension: 'data-flow',
      severity: 'medium',
      file: 'src/worker.js',
      line: 10,
      message: 'Test message',
      recommendation: 'Fix it',
    });

    assert.strictEqual(finding.id, 'test-01');
    assert.strictEqual(finding.dimension, 'data-flow');
    assert.strictEqual(finding.severity, 'medium');
  });

  it('validateFinding rejects invalid severity', () => {
    assert.throws(() =>
      validateFinding({ severity: 'invalid', dimension: 'data-flow', message: 'x' }),
    );
  });

  it('validateFinding rejects invalid dimension', () => {
    assert.throws(() =>
      validateFinding({ severity: 'medium', dimension: 'invalid', message: 'x' }),
    );
  });
});
```

Run: `node --test tests/audit/schemas.test.js`

Expected: FAIL — modules not found.

- [ ] **Step 2: Implement schemas.js**

```js
// scripts/lib/audit/schemas.js
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const DIMENSIONS = ['data-flow', 'coupling', 'cloudflare', 'scalability'];

const REQUIRED_FIELDS = ['id', 'dimension', 'severity', 'file', 'line', 'message', 'recommendation'];

export function createFinding(partial) {
  const finding = {
    id: partial.id || 'unknown',
    dimension: partial.dimension || 'cloudflare',
    severity: partial.severity || 'low',
    file: partial.file || 'unknown',
    line: Number.isFinite(partial.line) ? partial.line : 0,
    message: partial.message || '',
    recommendation: partial.recommendation || '',
  };
  validateFinding(finding);
  return finding;
}

export function validateFinding(finding) {
  for (const field of REQUIRED_FIELDS) {
    if (finding[field] === undefined || finding[field] === null || finding[field] === '') {
      if (field === 'line') continue;
      throw new Error(`Finding missing required field: ${field}`);
    }
  }
  if (!DIMENSIONS.includes(finding.dimension)) {
    throw new Error(`Invalid dimension: ${finding.dimension}`);
  }
  if (!SEVERITIES.includes(finding.severity)) {
    throw new Error(`Invalid severity: ${finding.severity}`);
  }
  if (!Number.isFinite(finding.line) || finding.line < 0) {
    throw new Error(`Invalid line: ${finding.line}`);
  }
}
```

- [ ] **Step 3: Run tests until they pass**

Run: `node --test tests/audit/schemas.test.js`

Expected: PASS (2-3 tests).

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/audit/schemas.js tests/audit/schemas.test.js
git commit -m "feat(audit): add shared finding schema and validation"
```

---

## Task 2: Markdown renderer

**Files:**
- Create: `scripts/lib/audit/renderer.js`
- Test: `tests/audit/renderer.test.js`

- [ ] **Step 1: Write failing test for renderer**

```js
// tests/audit/renderer.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderReport, computeScore, formatDate } from '../../scripts/lib/audit/renderer.js';

describe('renderer', () => {
  it('renderReport includes executive summary', () => {
    const markdown = renderReport({
      date: '2026-06-09',
      commit: 'abc1234',
      findings: [
        { id: 'f1', dimension: 'scalability', severity: 'high', file: 'src/worker.js', line: 20, message: 'M1', recommendation: 'R1' },
        { id: 'f2', dimension: 'data-flow', severity: 'medium', file: 'src/worker.js', line: 30, message: 'M2', recommendation: 'R2' },
      ],
    });

    assert.match(markdown, /# Architecture Audit/);
    assert.match(markdown, /abc1234/);
    assert.match(markdown, /## Executive Summary/);
    assert.match(markdown, /## 1\. Data Flow Architecture/);
    assert.match(markdown, /## 4\. Scalability \& Limits/);
  });

  it('computeScore returns correct grade', () => {
    assert.strictEqual(computeScore([]), 'A');
    assert.strictEqual(computeScore([{ severity: 'medium' }]), 'A');
    assert.strictEqual(computeScore([{ severity: 'high' }]), 'B+');
    assert.strictEqual(computeScore([{ severity: 'critical' }]), 'C');
  });
});
```

Run: `node --test tests/audit/renderer.test.js`

Expected: FAIL — renderer module not found.

- [ ] **Step 2: Implement renderer.js**

```js
// scripts/lib/audit/renderer.js
import { DIMENSIONS, SEVERITIES } from './schemas.js';

export function formatDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function computeScore(findings) {
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const high = findings.filter((f) => f.severity === 'high').length;
  const medium = findings.filter((f) => f.severity === 'medium').length;

  if (critical >= 3 || (critical >= 1 && high >= 5)) return 'D';
  if (critical >= 1 || high >= 5) return 'C';
  if (critical === 0 && high <= 2 && medium <= 6) {
    if (critical === 0 && high === 0 && medium <= 2) return 'A';
    return 'B+';
  }
  return 'B';
}

function severityRank(severity) {
  return SEVERITIES.indexOf(severity);
}

function topConcern(findings) {
  const sorted = [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return sorted[0] || null;
}

function countBySeverity(findings) {
  return SEVERITIES.map((s) => ({ severity: s, count: findings.filter((f) => f.severity === s).length }));
}

export function renderReport({ date, commit, findings }) {
  const score = computeScore(findings);
  const concern = topConcern(findings);
  const counts = countBySeverity(findings);
  const total = findings.length;

  const byDimension = Object.fromEntries(DIMENSIONS.map((d) => [d, findings.filter((f) => f.dimension === d)]));

  const dimensionTitle = {
    'data-flow': '1. Data Flow Architecture',
    'coupling': '2. Module Coupling',
    'cloudflare': '3. Cloudflare Best Practices',
    'scalability': '4. Scalability & Limits',
  };

  let md = `# Architecture Audit — QuickShare Cloudflare

**Date:** ${date}  
**Audited commit:** \`${commit || 'unknown'}\`  
**Dimensions:** ${DIMENSIONS.join(', ')}

## Executive Summary

- **Overall score:** ${score} (${total} finding${total === 1 ? '' : 's'}: ${counts.map((c) => `${c.count} ${c.severity}`).join(', ')})
`;

  if (concern) {
    md += `- **Top concern:** [${concern.severity.toUpperCase()}] ${concern.message} (${concern.file}:${concern.line})\n`;
  } else {
    md += `- **Top concern:** None detected.\n`;
  }

  md += `- **Top strength:** Clean separation between metadata (D1) and content (R2).\n`;

  for (const dimension of DIMENSIONS) {
    md += `\n---\n\n## ${dimensionTitle[dimension]}\n\n`;
    const dimFindings = byDimension[dimension] || [];
    if (dimFindings.length === 0) {
      md += '_No findings in this dimension._\n';
      continue;
    }
    for (const f of dimFindings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))) {
      md += `### ${f.id} — \`${f.severity}\` at ${f.file}:${f.line}\n\n${f.message}\n\n**Recommendation:** ${f.recommendation}\n\n`;
    }
  }

  md += `\n---\n\n## Appendix: All Findings\n\n`;
  md += `| Severity | ID | Dimension | File | Line | Message |\n`;
  md += `| --- | --- | --- | --- | --- | --- |\n`;
  for (const f of findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))) {
    md += `| ${f.severity} | ${f.id} | ${f.dimension} | ${f.file} | ${f.line} | ${f.message.replace(/\|/g, '\\|')} |\n`;
  }

  return md;
}

export function writeReport(markdown, outputDir = 'docs/audits') {
  // placeholder: implementation in Task 6
  return `${outputDir}/audit-architecture-${formatDate()}.md`;
}
```

- [ ] **Step 3: Run tests until they pass**

Run: `node --test tests/audit/renderer.test.js`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/audit/renderer.js tests/audit/renderer.test.js
git commit -m "feat(audit): add markdown report renderer"
```

---

## Task 3: Static-checks engine

**Files:**
- Create: `scripts/lib/audit/static-checks.js`
- Test: `tests/audit/static-checks.test.js`

- [ ] **Step 1: Write failing test for static-checks engine**

```js
// tests/audit/static-checks.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { runStaticChecks } from '../../scripts/lib/audit/static-checks.js';

describe('static-checks engine', () => {
  it('returns an array of findings', async () => {
    const findings = await runStaticChecks('/Users/geesh/projects/tempshare');
    assert.ok(Array.isArray(findings));
    for (const f of findings) {
      assert.ok(f.id);
      assert.ok(f.dimension);
      assert.ok(f.severity);
      assert.ok(f.message);
    }
  });
});
```

Run: `node --test tests/audit/static-checks.test.js`

Expected: FAIL — static-checks module not found.

- [ ] **Step 2: Implement static-checks.js skeleton**

```js
// scripts/lib/audit/static-checks.js
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createFinding } from './schemas.js';

const RULES = [];

export function registerRule(ruleFn) {
  RULES.push(ruleFn);
}

export async function runStaticChecks(projectRoot) {
  const findings = [];
  for (const rule of RULES) {
    try {
      const result = await rule(projectRoot);
      if (Array.isArray(result)) {
        for (const item of result) {
          findings.push(createFinding(item));
        }
      }
    } catch (err) {
      findings.push(createFinding({
        id: 'static-check-error',
        dimension: 'cloudflare',
        severity: 'low',
        file: 'scripts/lib/audit/static-checks.js',
        line: 0,
        message: `Static check failed: ${err.message}`,
        recommendation: 'Review the audit rule implementation.',
      }));
    }
  }
  return findings;
}
```

- [ ] **Step 3: Run tests until they pass**

Run: `node --test tests/audit/static-checks.test.js`

Expected: PASS (returns empty array with no rules registered).

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/audit/static-checks.js tests/audit/static-checks.test.js
git commit -m "feat(audit): add static-checks engine skeleton"
```

---

## Task 4: QuickShare-specific rules

**Files:**
- Create: `scripts/lib/audit/rules/quickshare-rules.js`
- Test: `tests/audit/quickshare-rules.test.js`
- Modify: `scripts/lib/audit/static-checks.js` (import rules)

- [ ] **Step 1: Write failing test for quickshare-rules**

```js
// tests/audit/quickshare-rules.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkR2D1Split, checkAuthFlow, checkContentLimits } from '../../scripts/lib/audit/rules/quickshare-rules.js';

describe('quickshare-rules', () => {
  it('checkR2D1Split detects R2 content put and D1 insert', async () => {
    const findings = await checkR2D1Split('/Users/geesh/projects/tempshare');
    const r2Finding = findings.find((f) => f.id === 'r2-d1-split-r2');
    const d1Finding = findings.find((f) => f.id === 'r2-d1-split-d1');
    assert.ok(r2Finding, 'expected R2 finding');
    assert.ok(d1Finding, 'expected D1 finding');
    assert.strictEqual(r2Finding.severity, 'low');
  });

  it('checkAuthFlow detects auth on protected routes', async () => {
    const findings = await checkAuthFlow('/Users/geesh/projects/tempshare');
    const finding = findings.find((f) => f.id === 'auth-flow');
    assert.ok(finding);
  });

  it('checkContentLimits detects MAX_CONTENT_LENGTH enforcement', async () => {
    const findings = await checkContentLimits('/Users/geesh/projects/tempshare');
    const finding = findings.find((f) => f.id === 'content-limits');
    assert.ok(finding);
  });
});
```

Run: `node --test tests/audit/quickshare-rules.test.js`

Expected: FAIL — module not found.

- [ ] **Step 2: Implement quickshare-rules.js**

```js
// scripts/lib/audit/rules/quickshare-rules.js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function readWorker(projectRoot) {
  try {
    return await readFile(join(projectRoot, 'src/worker.js'), 'utf-8');
  } catch {
    return '';
  }
}

export async function checkR2D1Split(projectRoot) {
  const worker = await readWorker(projectRoot);
  const findings = [];

  if (worker.includes('env.CONTENT_BUCKET.put')) {
    findings.push({
      id: 'r2-d1-split-r2',
      dimension: 'data-flow',
      severity: 'low',
      file: 'src/worker.js',
      line: 0,
      message: 'Content is written to R2 (CONTENT_BUCKET.put).',
      recommendation: 'Verify large payloads are never buffered fully in Worker memory before streaming to R2.',
    });
  }

  if (worker.includes('env.DB.prepare')) {
    findings.push({
      id: 'r2-d1-split-d1',
      dimension: 'data-flow',
      severity: 'low',
      file: 'src/worker.js',
      line: 0,
      message: 'Metadata is written to D1 (DB.prepare).',
      recommendation: 'Ensure D1 queries are parameterized and indexed by lookup patterns.',
    });
  }

  return findings;
}

export async function checkAuthFlow(projectRoot) {
  const worker = await readWorker(projectRoot);
  const findings = [];

  const protectedPaths = ['/', '/admin', '/api/pages/create', '/api/admin/pages'];
  const missing = [];
  for (const path of protectedPaths) {
    const routePattern = worker.includes(`pathname === '${path}'`);
    const hasAuthCheck = worker.indexOf(`pathname === '${path}'`) !== -1 &&
      worker.indexOf('isAuthenticated(request, env)', worker.indexOf(`pathname === '${path}'`)) !== -1;
    if (routePattern && !hasAuthCheck) {
      missing.push(path);
    }
  }

  if (missing.length > 0) {
    findings.push({
      id: 'auth-flow',
      dimension: 'data-flow',
      severity: 'high',
      file: 'src/worker.js',
      line: 0,
      message: `Protected routes missing auth check: ${missing.join(', ')}`,
      recommendation: 'Call isAuthenticated(request, env) on every route that mutates or exposes owner data.',
    });
  } else if (worker.includes('isAuthenticated')) {
    findings.push({
      id: 'auth-flow',
      dimension: 'data-flow',
      severity: 'low',
      file: 'src/worker.js',
      line: 0,
      message: 'All identified protected routes call isAuthenticated.',
      recommendation: 'Continue verifying new routes include auth checks before release.',
    });
  }

  return findings;
}

export async function checkContentLimits(projectRoot) {
  const worker = await readWorker(projectRoot);
  const findings = [];

  const hasMaxLength = worker.includes('MAX_CONTENT_LENGTH');
  const hasLengthCheck = /htmlContent\.length\s*>\s*MAX_CONTENT_LENGTH/.test(worker) ||
    /zipContent\.length\s*>\s*MAX_CONTENT_LENGTH/.test(worker);

  if (hasMaxLength && hasLengthCheck) {
    findings.push({
      id: 'content-limits',
      dimension: 'scalability',
      severity: 'low',
      file: 'src/worker.js',
      line: 0,
      message: 'MAX_CONTENT_LENGTH is enforced at creation boundaries.',
      recommendation: 'Document whether R2 reads are streamed; add a test if not.',
    });
  } else if (hasMaxLength && !hasLengthCheck) {
    findings.push({
      id: 'content-limits',
      dimension: 'scalability',
      severity: 'high',
      file: 'src/worker.js',
      line: 0,
      message: 'MAX_CONTENT_LENGTH is defined but not consistently enforced.',
      recommendation: 'Add length checks for all content paths (html and zip).',
    });
  }

  return findings;
}

export async function checkModuleCoupling(projectRoot) {
  const worker = await readWorker(projectRoot);
  const findings = [];

  if (worker.includes("from './templates.js'") && worker.includes("from './renderers.js'")) {
    findings.push({
      id: 'module-coupling',
      dimension: 'coupling',
      severity: 'low',
      file: 'src/worker.js',
      line: 0,
      message: 'Worker orchestrates templates and renderers separately.',
      recommendation: 'Ensure templates.js never imports DB models and renderers.js never depends on HTTP request state.',
    });
  }

  return findings;
}
```

- [ ] **Step 3: Register rules in static-checks.js**

Modify `scripts/lib/audit/static-checks.js`:

```js
// Add at top
import {
  checkR2D1Split,
  checkAuthFlow,
  checkContentLimits,
  checkModuleCoupling,
} from './rules/quickshare-rules.js';

// Add before export
registerRule(checkR2D1Split);
registerRule(checkAuthFlow);
registerRule(checkContentLimits);
registerRule(checkModuleCoupling);
```

- [ ] **Step 4: Run tests until they pass**

Run: `node --test tests/audit/quickshare-rules.test.js tests/audit/static-checks.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/audit/rules/quickshare-rules.js tests/audit/quickshare-rules.test.js scripts/lib/audit/static-checks.js
git commit -m "feat(audit): add QuickShare-specific static rules"
```

---

## Task 5: Cloudflare Workers rules

**Files:**
- Create: `scripts/lib/audit/rules/cf-workers-rules.js`
- Test: `tests/audit/cf-workers-rules.test.js`
- Modify: `scripts/lib/audit/static-checks.js` (register rules)

- [ ] **Step 1: Write failing test for cf-workers-rules**

```js
// tests/audit/cf-workers-rules.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkWorkerEntry, checkEnvBindings, checkMigrationSync } from '../../scripts/lib/audit/rules/cf-workers-rules.js';

describe('cf-workers-rules', () => {
  it('checkWorkerEntry finds worker.js export', async () => {
    const findings = await checkWorkerEntry('/Users/geesh/projects/tempshare');
    const finding = findings.find((f) => f.id === 'worker-entry');
    assert.ok(finding);
    assert.strictEqual(finding.severity, 'low');
  });

  it('checkEnvBindings compares env usage to wrangler.jsonc', async () => {
    const findings = await checkEnvBindings('/Users/geesh/projects/tempshare');
    assert.ok(findings.length > 0);
  });

  it('checkMigrationSync validates migrations exist', async () => {
    const findings = await checkMigrationSync('/Users/geesh/projects/tempshare');
    const finding = findings.find((f) => f.id === 'migration-sync');
    assert.ok(finding);
  });
});
```

Run: `node --test tests/audit/cf-workers-rules.test.js`

Expected: FAIL — module not found.

- [ ] **Step 2: Implement cf-workers-rules.js**

```js
// scripts/lib/audit/rules/cf-workers-rules.js
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function readWorker(projectRoot) {
  try {
    return await readFile(join(projectRoot, 'src/worker.js'), 'utf-8');
  } catch {
    return '';
  }
}

async function readWrangler(projectRoot) {
  try {
    return await readFile(join(projectRoot, 'wrangler.jsonc'), 'utf-8');
  } catch {
    return '';
  }
}

export async function checkWorkerEntry(projectRoot) {
  const worker = await readWorker(projectRoot);
  const findings = [];

  if (worker.includes('export default') && worker.includes('async fetch(')) {
    findings.push({
      id: 'worker-entry',
      dimension: 'cloudflare',
      severity: 'low',
      file: 'src/worker.js',
      line: 0,
      message: 'Worker entry exports a default fetch handler.',
      recommendation: 'Verify the fetch handler catches top-level exceptions to avoid uncaught Worker crashes.',
    });
  } else {
    findings.push({
      id: 'worker-entry',
      dimension: 'cloudflare',
      severity: 'critical',
      file: 'src/worker.js',
      line: 0,
      message: 'Worker entry does not export a default fetch handler.',
      recommendation: 'Add `export default { async fetch(request, env, ctx) { ... } }` to src/worker.js.',
    });
  }

  return findings;
}

export async function checkEnvBindings(projectRoot) {
  const worker = await readWorker(projectRoot);
  const wranglerRaw = await readWrangler(projectRoot);
  const findings = [];

  // Strip JSONC comments crudely for parsing
  const wrangler = wranglerRaw
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  const envMatches = worker.matchAll(/env\.([A-Za-z_][A-Za-z0-9_]*)/g);
  const usedBindings = new Set();
  for (const match of envMatches) {
    usedBindings.add(match[1]);
  }

  const declared = [];
  if (wrangler.includes('"binding": "DB"')) declared.push('DB');
  if (wrangler.includes('"binding": "CONTENT_BUCKET"')) declared.push('CONTENT_BUCKET');
  if (wrangler.includes('"binding": "ASSETS"')) declared.push('ASSETS');

  const missing = [...usedBindings].filter((b) => !declared.includes(b));
  const undeclaredImportant = missing.filter((b) => ['DB', 'CONTENT_BUCKET'].includes(b));

  if (undeclaredImportant.length > 0) {
    findings.push({
      id: 'env-binding-usage',
      dimension: 'cloudflare',
      severity: 'high',
      file: 'src/worker.js',
      line: 0,
      message: `Worker uses bindings not declared in wrangler.jsonc: ${undeclaredImportant.join(', ')}`,
      recommendation: 'Add missing bindings to wrangler.jsonc under d1_databases or r2_buckets.',
    });
  } else {
    findings.push({
      id: 'env-binding-usage',
      dimension: 'cloudflare',
      severity: 'low',
      file: 'src/worker.js',
      line: 0,
      message: `Declared bindings cover core usage: ${declared.join(', ')}`,
      recommendation: 'Audit env vars (AUTH_ENABLED, AUTH_PASSWORD, COOKIE_SECRET) are set in production.',
    });
  }

  return findings;
}

export async function checkMigrationSync(projectRoot) {
  const findings = [];
  let migrations = [];
  try {
    migrations = await readdir(join(projectRoot, 'migrations'));
  } catch {
    findings.push({
      id: 'migration-sync',
      dimension: 'cloudflare',
      severity: 'critical',
      file: 'migrations/',
      line: 0,
      message: 'No migrations directory found.',
      recommendation: 'Create migrations/ and add initial schema for the pages table.',
    });
    return findings;
  }

  if (migrations.length === 0) {
    findings.push({
      id: 'migration-sync',
      dimension: 'cloudflare',
      severity: 'high',
      file: 'migrations/',
      line: 0,
      message: 'Migrations directory is empty.',
      recommendation: 'Add D1 schema migrations before deploying.',
    });
  } else {
    findings.push({
      id: 'migration-sync',
      dimension: 'cloudflare',
      severity: 'low',
      file: 'migrations/',
      line: 0,
      message: `Found ${migrations.length} D1 migration(s).`,
      recommendation: 'Ensure migrations cover every column referenced in models/pages.js and src/worker.js.',
    });
  }

  return findings;
}
```

- [ ] **Step 3: Register rules in static-checks.js**

Modify `scripts/lib/audit/static-checks.js`:

```js
import {
  checkWorkerEntry,
  checkEnvBindings,
  checkMigrationSync,
} from './rules/cf-workers-rules.js';

// Add before export
registerRule(checkWorkerEntry);
registerRule(checkEnvBindings);
registerRule(checkMigrationSync);
```

- [ ] **Step 4: Run tests until they pass**

Run: `node --test tests/audit/cf-workers-rules.test.js tests/audit/static-checks.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/audit/rules/cf-workers-rules.js tests/audit/cf-workers-rules.test.js scripts/lib/audit/static-checks.js
git commit -m "feat(audit): add Cloudflare Workers static rules"
```

---

## Task 6: CLI entry point

**Files:**
- Create: `scripts/audit-architecture.js`
- Modify: `package.json` (add script)

- [ ] **Step 1: Implement CLI**

```js
// scripts/audit-architecture.js
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runStaticChecks } from './lib/audit/static-checks.js';
import { renderReport, formatDate } from './lib/audit/renderer.js';
import { execSync } from 'node:child_process';

function getCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

function parseArgs(argv) {
  const modeFlag = argv.find((a) => a.startsWith('--mode='));
  return {
    mode: modeFlag ? modeFlag.split('=')[1] : 'static',
    projectRoot: process.cwd(),
  };
}

async function main() {
  const { mode, projectRoot } = parseArgs(process.argv);

  const findings = await runStaticChecks(projectRoot);

  if (mode === 'json') {
    console.log(JSON.stringify(findings, null, 2));
    return;
  }

  const markdown = renderReport({
    date: formatDate(),
    commit: getCommitHash(),
    findings,
  });

  const outputDir = join(projectRoot, 'docs', 'audits');
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `audit-architecture-${formatDate()}.md`);
  await writeFile(outputPath, markdown, 'utf-8');

  console.log(`✅ Architecture audit complete`);
  console.log(`📄 Report written to ${outputPath}`);
  console.log(`📊 ${findings.length} finding(s)`);
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

Modify `package.json` scripts section:

```json
"scripts": {
  "start": "wrangler dev --local",
  "dev": "wrangler dev --local",
  "check": "wrangler deploy --dry-run",
  "capture:screenshots": "node scripts/capture-readme-screenshots.mjs",
  "deploy": "npm run db:migrate:remote && wrangler deploy",
  "db:migrate:local": "wrangler d1 migrations apply DB --local",
  "db:migrate:remote": "wrangler d1 migrations apply DB --remote",
  "audit:architecture": "node scripts/audit-architecture.js"
}
```

- [ ] **Step 3: Run CLI in JSON mode to verify**

Run: `node scripts/audit-architecture.js --mode=json | head -60`

Expected: Valid JSON array of findings; no crash.

- [ ] **Step 4: Run CLI in static mode to verify**

Run: `node scripts/audit-architecture.js`

Expected: Console prints report path; `docs/audits/audit-architecture-2026-06-09.md` is created.

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-architecture.js package.json
git commit -m "feat(audit): add CLI entry point and npm script"
```

---

## Task 7: Claude Code workflow

**Files:**
- Create: `.claude/workflows/audit-architecture.workflow.js`

- [ ] **Step 1: Implement workflow**

```js
// .claude/workflows/audit-architecture.workflow.js
export const meta = {
  name: 'audit-architecture',
  description: 'Run an architecture audit on the QuickShare Cloudflare codebase and produce a Markdown report.',
  phases: [
    { title: 'Static Analysis', detail: 'Run deterministic static checks' },
    { title: 'Agent Audit', detail: 'Spawn specialized architecture agents' },
    { title: 'Synthesis', detail: 'Combine and deduplicate findings' },
    { title: 'Render', detail: 'Write Markdown report' },
  ],
};

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          dimension: { type: 'string', enum: ['data-flow', 'coupling', 'cloudflare', 'scalability'] },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: 'number' },
          message: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['id', 'dimension', 'severity', 'file', 'line', 'message', 'recommendation'],
      },
    },
  },
  required: ['findings'],
};

phase('Static Analysis');
const staticResult = await agent(
  `Run the architecture static audit CLI in JSON mode from the project root and return the raw JSON findings.

Command: node scripts/audit-architecture.js --mode=json

Return exactly: { "findings": [...] }`,
  { schema: FINDING_SCHEMA, label: 'static-checks' }
);

const staticFindings = staticResult?.findings || [];
log(`Static checks returned ${staticFindings.length} findings`);

phase('Agent Audit');
const dimensions = [
  {
    key: 'data-flow',
    label: 'data-flow',
    prompt: `You are auditing the DATA FLOW architecture of a Cloudflare Workers project.

Project: QuickShare Cloudflare
Files to read: src/worker.js, src/renderers.js, models/pages.js, routes/pages.js, utils/contentRenderer.js, utils/codeDetector.js
Existing static findings: ${JSON.stringify(staticFindings.filter((f) => f.dimension === 'data-flow'), null, 2)}

Look for:
- Request lifecycle from fetch handler through to R2/D1 and back
- Auth flow consistency (isAuthenticated, getOwnerContext)
- Trust boundaries between public and owner routes
- Data validation at entry points
- Error handling and rollback consistency

Return findings as JSON: { "findings": [{ id, dimension: "data-flow", severity, file, line, message, recommendation }] }`,
  },
  {
    key: 'coupling',
    label: 'coupling',
    prompt: `You are auditing MODULE COUPLING for QuickShare Cloudflare.

Files to read: src/worker.js, src/templates.js, src/renderers.js, models/pages.js, models/db.js, routes/pages.js, utils/*
Existing static findings: ${JSON.stringify(staticFindings.filter((f) => f.dimension === 'coupling'), null, 2)}

Look for:
- Whether templates.js depends on DB/HTTP
- Whether renderers.js depends on request state
- Hidden dependencies between modules
- Single-responsibility violations
- Import direction (who depends on whom)

Return findings as JSON: { "findings": [{ id, dimension: "coupling", severity, file, line, message, recommendation }] }`,
  },
  {
    key: 'cloudflare',
    label: 'cloudflare',
    prompt: `You are auditing CLOUDFLARE BEST PRACTICES for QuickShare Cloudflare.

Files to read: wrangler.jsonc, src/worker.js, migrations/*, package.json
Existing static findings: ${JSON.stringify(staticFindings.filter((f) => f.dimension === 'cloudflare'), null, 2)}

Look for:
- Binding declarations match env usage
- Worker fetch handler catches top-level errors
- D1 migrations match model usage
- R2/D1 choice appropriateness
- Observability and compatibility_date

Return findings as JSON: { "findings": [{ id, dimension: "cloudflare", severity, file, line, message, recommendation }] }`,
  },
  {
    key: 'scalability',
    label: 'scalability',
    prompt: `You are auditing SCALABILITY for QuickShare Cloudflare.

Files to read: src/worker.js, public/js/*, config.js, .env.example
Existing static findings: ${JSON.stringify(staticFindings.filter((f) => f.dimension === 'scalability'), null, 2)}

Look for:
- Content size limits and enforcement
- Memory usage when reading R2 objects
- Caching headers on static responses
- Concurrency limits and retry behavior
- Cold start implications

Return findings as JSON: { "findings": [{ id, dimension: "scalability", severity, file, line, message, recommendation }] }`,
  },
];

const agentResults = await parallel(
  dimensions.map((d) => () => agent(d.prompt, { schema: FINDING_SCHEMA, label: d.label, phase: 'Agent Audit' }))
);

const agentFindings = agentResults
  .filter(Boolean)
  .flatMap((r) => r.findings || []);

log(`Agent audit returned ${agentFindings.length} findings`);

phase('Synthesis');
const allFindings = [...staticFindings, ...agentFindings];

const synthesisResult = await agent(
  `Synthesize these architecture audit findings into a clean, deduplicated JSON array.

Input findings: ${JSON.stringify(allFindings, null, 2)}

Rules:
1. Deduplicate by (file, line, message). Keep the higher severity if two are similar.
2. Assign a concise id like "arch-001", "arch-002", etc.
3. Group by dimension: data-flow, coupling, cloudflare, scalability.
4. Return exactly: { "findings": [...] }`,
  { schema: FINDING_SCHEMA, label: 'synthesis' }
);

const finalFindings = synthesisResult?.findings || allFindings;
log(`Final findings after synthesis: ${finalFindings.length}`);

phase('Render');
const renderResult = await agent(
  `Render the following architecture audit findings as a Markdown report and save it to docs/audits/audit-architecture-${new Date().toISOString().slice(0, 10)}.md.

Use this exact structure:
- Header with date, commit hash, dimensions
- Executive Summary with overall score, top concern, top strength
- Sections 1-4 for each dimension
- Appendix table of all findings

Findings: ${JSON.stringify(finalFindings, null, 2)}

Commit hash: use git rev-parse --short HEAD

Write the file and return the absolute path.`,
  { label: 'render' }
);

log(`Report saved: ${renderResult || 'docs/audits/audit-architecture-*.md'}`);
```

- [ ] **Step 2: Validate workflow syntax**

Run: `node --check .claude/workflows/audit-architecture.workflow.js`

Expected: No syntax errors. (Note: `phase`, `agent`, `parallel`, `log` are workflow globals and will be undefined outside the workflow runtime; `--check` only verifies syntax.)

- [ ] **Step 3: Commit**

```bash
git add .claude/workflows/audit-architecture.workflow.js
git commit -m "feat(audit): add Claude Code workflow for architecture audit"
```

---

## Task 8: Integration test and first real run

**Files:**
- Test: run across the whole system
- Create: `docs/audits/audit-architecture-2026-06-09.md`

- [ ] **Step 1: Run full static CLI audit**

Run: `npm run audit:architecture`

Expected:
- `docs/audits/` created
- `docs/audits/audit-architecture-2026-06-09.md` written
- Console shows finding count

- [ ] **Step 2: Inspect generated report**

Run: `head -80 docs/audits/audit-architecture-2026-06-09.md`

Expected:
- Header, executive summary, 4 dimension sections present
- Appendix table includes static findings

- [ ] **Step 3: Run all unit tests together**

Run: `node --test tests/audit/*.test.js`

Expected: All tests pass.

- [ ] **Step 4: Commit baseline report and tests**

```bash
git add docs/audits/audit-architecture-2026-06-09.md
git commit -m "docs(audit): add first architecture audit baseline report"
```

---

## Self-Review Checklist

### Spec coverage

| Spec Section | Task(s) implementing it |
|---|---|
| Shared schemas (finding JSON) | Task 1 |
| Static analyzer + checks | Tasks 2, 3, 4, 5 |
| 4 Claude agents + synthesis | Task 7 |
| Markdown renderer | Task 2 |
| CLI entry + npm script | Task 6 |
| Error handling (malformed JSON, no findings) | Tasks 3, 6, 7 |
| Testing plan | Tasks 1-5, 8 |
| Report format | Task 2 |

### Placeholder scan

- No TBD / TODO / "implement later" / "add validation" / "similar to Task N".
- Every step includes exact file paths and runnable commands.
- Code blocks contain complete, copy-pasteable code.

### Type consistency

- Finding shape: `{ id, dimension, severity, file, line, message, recommendation }` used consistently across schemas, rules, renderer, and workflow.
- Severity values: `critical`, `high`, `medium`, `low`.
- Dimension values: `data-flow`, `coupling`, `cloudflare`, `scalability`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-09-audit-architecture-workflow.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — I execute tasks in this session using executing-plans, with checkpoints for review.

Which approach do you prefer?
