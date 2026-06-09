# Design: Audit Architecture Workflow for QuickShare Cloudflare

**Date:** 2026-06-09  
**Target codebase:** QuickShare Cloudflare (`/Users/geesh/projects/tempshare`)  
**Approach:** Agent-driven Claude Code workflow + companion CLI  

---

## 1. Purpose

Create a reusable, hybrid audit system that evaluates the architecture of the QuickShare Cloudflare codebase and produces a structured Markdown report. It must run in two modes:

1. **Inside Claude Code** — deep, agent-driven architecture review.
2. **Standalone CLI** — fast, deterministic static checks without requiring Claude.

---

## 2. Goals

- Surface architectural risks in data flow, module coupling, Cloudflare best practices, and scalability.
- Produce a timestamped Markdown report that can be committed as an audit baseline.
- Run fast enough that developers will actually run it before big refactors or releases.
- Stay tailored to QuickShare; do not over-abstract into a generic framework.

---

## 3. Non-Goals

- Not a security penetration test (no fuzzing, no runtime exploit checks).
- Not a linting or formatting tool (eslint/prettier are out of scope).
- Not a generic audit framework for arbitrary codebases.

---

## 4. Architecture

### 4.1 File Layout

```
.claude/
└── workflows/
    └── audit-architecture.workflow.js   # orchestrates 4 audit agents

scripts/
├── audit-architecture.js                # CLI entry point
└── lib/
    └── audit/
        ├── static-checks.js             # deterministic heuristics
        ├── renderer.js                  # Markdown report builder
        ├── schemas.js                   # shared JSON schemas for findings
        └── rules/
            ├── quickshare-rules.js      # QuickShare-specific checks
            └── cf-workers-rules.js      # Cloudflare Workers patterns

docs/
└── audits/
    └── audit-architecture-YYYY-MM-DD.md # generated reports
```

### 4.2 Entry Points

```bash
# Inside Claude Code — full audit with reasoning agents
/workflows audit-architecture

# Standalone — static checks only
node scripts/audit-architecture.js

# Via npm (optional convenience)
npm run audit:architecture
```

### 4.3 Run Modes

Mode is selected via CLI flag or workflow argument:

```bash
node scripts/audit-architecture.js --mode=static   # static checks + Markdown report
node scripts/audit-architecture.js --mode=json     # static checks + JSON to stdout
/workflows audit-architecture                      # claude mode (default inside Claude)
```

| Mode | What runs | Output |
|---|---|---|
| `claude` (default in Claude Code) | Static checks + 4 Claude agents + synthesis | Markdown report |
| `static` | Static checks only | Markdown report |
| `json` | Static checks only | Raw JSON to stdout |

---

## 5. Components

### 5.1 Static Analyzer (`scripts/lib/audit/static-checks.js`)

Deterministic checks tailored to QuickShare:

| Check ID | Dimension | What it verifies |
|---|---|---|
| `worker-entry` | `cloudflare` | `src/worker.js` exists and exports a default fetch handler. |
| `route-coverage` | `data-flow` | All routes in `worker.js` have handlers; no unreachable paths. |
| `r2-d1-split` | `data-flow` | Large content goes to R2 (`pages/{id}.txt`); metadata goes to D1. |
| `auth-flow` | `data-flow` | Protected routes call `isAuthenticated`; owner routes call `getOwnerContext`. |
| `env-binding-usage` | `cloudflare` | Every `env.*` reference has a matching binding in `wrangler.jsonc`. |
| `content-limits` | `scalability` | `MAX_CONTENT_LENGTH` is enforced at the creation boundary. |
| `missing-error-handlers` | `scalability` | Async handlers are wrapped; no unhandled throws on routes. |
| `migration-sync` | `cloudflare` | D1 migrations cover fields accessed in `models/pages.js`. |
| `module-coupling` | `coupling` | `templates.js` does not import DB models; `renderers.js` does not depend on HTTP layer. |

Each check returns a finding object:

```json
{
  "id": "content-limits",
  "dimension": "scalability",
  "severity": "medium",
  "file": "src/worker.js",
  "line": 20,
  "message": "MAX_CONTENT_LENGTH is enforced, but response streaming for large R2 reads is not documented.",
  "recommendation": "Add a comment or test asserting that R2 objects are streamed to the client without full Worker memory buffering."
}
```

### 5.2 Claude Workflow Agents

The workflow spawns 4 agents in parallel. Each receives:

- The static-check JSON output.
- Relevant source files (read via `Read` or inlined in the prompt).
- A strict output schema.

| Agent | Dimension | Focus | Reads |
|---|---|---|---|
| `data-flow` | `data-flow` | Request lifecycle, data transformations, trust boundaries, auth flow. | `src/worker.js`, `src/renderers.js`, `models/`, `routes/`, `utils/` |
| `coupling` | `coupling` | Module boundaries, hidden dependencies, change blast radius, single-responsibility violations. | all `src/`, `models/`, `routes/`, `utils/` |
| `cloudflare` | `cloudflare` | Worker lifecycle, R2 limits, D1 query patterns, KV vs D1 choices, wrangler bindings. | `wrangler.jsonc`, `src/worker.js`, `migrations/`, `package.json` |
| `scalability` | `scalability` | Content size limits, concurrency, caching strategy, cold starts, error resilience. | `src/worker.js`, `public/js/`, `config.js`, `.env.example` |

Each agent returns findings in the same JSON schema as the static analyzer.

### 5.3 Synthesis Agent

A final agent:

1. Collects static + agent findings.
2. Deduplicates by `(file, line, message)`.
3. Scores severity if conflicting (`critical` > `high` > `medium` > `low`).
4. Structures findings into the four dimensions.
5. Emits a JSON object ready for the renderer.

### 5.4 Report Renderer (`scripts/lib/audit/renderer.js`)

Accepts the synthesized JSON and writes Markdown with these sections:

1. **Header** — date, commit hash, dimensions audited.
2. **Executive Summary** — overall score, top 3 concerns, top strength.
3. **1. Data Flow Architecture** — findings + recommendations.
4. **2. Module Coupling** — findings + recommendations.
5. **3. Cloudflare Best Practices** — findings + recommendations.
6. **4. Scalability & Limits** — findings + recommendations.
7. **Appendix** — full table of all findings.

Output path: `docs/audits/audit-architecture-YYYY-MM-DD.md`

---

## 6. Data Flow

```
User invokes workflow / CLI
         │
         ▼
┌─────────────────────────────┐
│ scripts/audit-architecture.js│
│ Static checks only (fast)    │
└─────────────┬───────────────┘
              │ JSON findings
              ▼
┌─────────────────────────────┐     ┌─────────────────────────────┐
│  Claude workflow            │     │  Standalone mode            │
│  spawns 4 agents (parallel) │     │  renderer writes Markdown   │
└─────────────┬───────────────┘     └─────────────────────────────┘
              │ JSON findings each
              ▼
┌─────────────────────────────┐
│  Synthesis agent             │
│  dedup + score + structure   │
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│  renderer.js                 │
│  writes Markdown to          │
│  docs/audits/...             │
└─────────────────────────────┘
```

---

## 7. Error Handling

| Failure | Behavior |
|---|---|
| CLI crashes or returns invalid JSON | Workflow logs a warning, continues with agent-only findings; report appendix notes the partial run. |
| An agent returns malformed JSON | Retry once; on second failure, skip that dimension and note it in the appendix. |
| No findings from any source | Report still generated with score "No issues detected" and a positive summary. |
| File read errors (missing `src/worker.js`, etc.) | Surface as a `critical` finding in the `static-checks` dimension. |
| Report directory missing | Renderer auto-creates `docs/audits/`. |

---

## 8. Testing Plan

1. **CLI self-test** — run `node scripts/audit-architecture.js` against the current QuickShare codebase; verify JSON schema validity and Markdown output.
2. **Workflow dry-run** — run `/workflows audit-architecture` and confirm all 4 agents complete, synthesis runs, and a timestamped `.md` file is created.
3. **Regression fixtures** — create `scripts/lib/audit/__fixtures__/minimal-project/` to test static checks on a known-good tiny Workers project.
4. **Snapshot test** — commit the first generated report as a baseline; future runs diff against it to catch drift.

---

## 9. Scoring Rules

The overall score is computed from deduplicated findings:

| Severity | Weight | Meaning |
| --- | --- | --- |
| `critical` | blocks A/B | Must fix before release; architectural risk or missing invariant. |
| `high` | heavy penalty | Significant risk or clear best-practice violation. |
| `medium` | moderate penalty | Worth addressing in next refactoring cycle. |
| `low` | minor penalty | Nit or documentation gap; fix if convenient. |

**Score mapping (after weighting):**

- **A** — 0 critical, 0 high, ≤2 medium findings.
- **B+** — 0 critical, ≤2 high, ≤6 medium findings.
- **B** — 0 critical, ≤4 high findings.
- **C** — ≥1 critical or ≥5 high findings.
- **D** — ≥3 critical or systemic failure across multiple dimensions.

The synthesis agent selects:

- **Top concern** — highest-severity finding with the broadest impact.
- **Top strength** — one positive architectural pattern explicitly called out by an agent.

---

## 10. Report Format

```markdown
# Architecture Audit — QuickShare Cloudflare

**Date:** 2026-06-09  
**Audited commit:** `9ebddc9`  
**Dimensions:** data-flow, coupling, cloudflare, scalability

## Executive Summary

- **Overall score:** B+ (12 findings: 0 critical, 2 high, 6 medium, 4 low)
- **Top concern:** R2 content is loaded fully into Worker memory before response;
  large pastes could hit Worker memory limits.
- **Top strength:** Clean separation between metadata (D1) and content (R2).

## 1. Data Flow Architecture
*(findings + recommendations)*

## 2. Module Coupling
*(findings + recommendations)*

## 3. Cloudflare Best Practices
*(findings + recommendations)*

## 4. Scalability & Limits
*(findings + recommendations)*

## Appendix: All Findings
| Severity | Dimension | File | Line | Message |
|---|---|---|---|---|
| medium | scalability | src/worker.js | 20 | ... |
```

---

## 10. Open Questions / Future Work

- Should the workflow auto-commit the generated report? (Decision: no, user decides.)
- Should findings be posted as inline PR comments? (Decision: out of scope for v1.)
- Should we add a fifth dimension for "deployment & operations"? (Decision: defer until after v1.)
