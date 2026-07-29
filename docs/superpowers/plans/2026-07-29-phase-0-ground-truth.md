# Phase 0 Ground Truth and Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one reproducible local/CI quality command, a deterministic
three-archetype generation corpus, and an explicit production-engine ownership
decision before changing generator behavior.

**Architecture:** Vitest remains the unit/regression runner already used by the
repository. A small pure normalization module removes volatile metadata before
stable JSON hashing. Corpus tests call the existing public generator entry
point and compare machine-readable summaries, while an ADR freezes production
ownership for Phase 1.

**Tech Stack:** TypeScript 5.6, Vite 6, Vitest 4, ESLint 9, npm, GitHub Actions.

## Global Constraints

- Extend the existing project; do not add a monorepo, backend, or second test runner.
- Do not change generator selection behavior in Phase 0.
- Do not update golden hashes to hide an unexplained regression.
- Treat `src/generators/gridGenerator` as the candidate production engine and
  document legacy/quality paths before Phase 1 removes their UI dispatch.
- Preserve the existing untracked browser screenshots and `.playwright-mcp/`.
- All generator fixtures must use explicit seed, archetype, subtype, size tier,
  loopiness, and danger.
- All new pure test helpers must avoid `Date.now`, `Math.random`, locale sorting,
  and filesystem-order dependence.

---

## File structure

Create:

- `src/testing/stableJson.ts` — recursive stable key ordering and FNV-1a hash.
- `src/testing/generationCorpus.ts` — fixed requests and normalized summaries.
- `src/testing/__tests__/stableJson.test.ts` — normalization/hash contracts.
- `src/generators/__tests__/generationCorpus.test.ts` — determinism and semantic
  regression corpus.
- `.github/workflows/check.yml` — CI running the same local check command.
- `docs/architecture/ACTIVE_GENERATOR_ADR.md` — production ownership decision.

Modify:

- `package.json` — canonical scripts.
- `docs/EXECUTION_ROADMAP.md` — Phase 0 evidence links after completion.
- `docs/DEVELOPMENT_PLAN.md` — point current-status readers to the authoritative
  execution roadmap.

Do not modify in this phase:

- `src/generators/generator.ts`;
- `src/generators/quality/pipeline.ts`;
- `src/ui/panels/GenerationPanel.tsx`;
- `src/workers/generation.worker.ts`;
- `src/store/EditorContext.tsx` or `src/store/editorStore.ts`.

### Task 1: Canonical local quality scripts

**Files:**

- Modify: `package.json`

**Interfaces:**

- Consumes: existing `vite`, `tsc`, `eslint`, and `vitest` installations.
- Produces: `npm test`, `npm run typecheck`, and `npm run check`.

- [ ] **Step 1: Confirm the missing-script baseline**

Run:

```powershell
npm run
```

Expected: `dev`, `build`, `lint`, and `preview` exist; `test`, `typecheck`, and
`check` do not.

- [ ] **Step 2: Add the canonical scripts**

Change the `scripts` object to:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc -b --pretty false",
  "check": "npm run test && npm run lint && npm run typecheck && npm run build"
}
```

- [ ] **Step 3: Run each failure domain separately**

Run:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: each command exits zero. If an existing failure appears, record its
exact command and output before making a narrowly scoped repair; do not weaken
the script.

- [ ] **Step 4: Run the aggregate command**

Run:

```powershell
npm run check
```

Expected: all four stages pass in the documented order.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore: add canonical quality scripts"
```

### Task 2: Stable normalization and hash helper

**Files:**

- Create: `src/testing/stableJson.ts`
- Create: `src/testing/__tests__/stableJson.test.ts`

**Interfaces:**

- Produces:

```ts
export type JsonScalar = string | number | boolean | null
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue }

export function stableJson(value: unknown): string
export function stableHash(value: unknown): string
```

- `stableJson` recursively sorts object keys, preserves array order, rejects
  `undefined`, functions, symbols, bigint, cyclic values, and non-finite numbers.
- `stableHash` returns an eight-character lowercase hexadecimal FNV-1a hash of
  `stableJson(value)`.

- [ ] **Step 1: Write failing normalization tests**

Create tests containing these assertions:

```ts
import { describe, expect, it } from 'vitest'
import { stableHash, stableJson } from '../stableJson'

describe('stableJson', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(stableJson({ z: 1, a: { y: 2, x: [3, 1] } }))
      .toBe('{"a":{"x":[3,1],"y":2},"z":1}')
  })

  it.each([
    { value: Number.NaN, label: 'non-finite number' },
    { value: undefined, label: 'undefined' },
    { value: 1n, label: 'bigint' },
  ])('rejects $label', ({ value }) => {
    expect(() => stableJson(value)).toThrow()
  })

  it('rejects cyclic input', () => {
    const value: Record<string, unknown> = {}
    value.self = value
    expect(() => stableJson(value)).toThrow('cyclic')
  })
})

describe('stableHash', () => {
  it('ignores object insertion order but not array order', () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }))
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]))
  })
})
```

- [ ] **Step 2: Verify the test fails**

Run:

```powershell
npx vitest run src/testing/__tests__/stableJson.test.ts
```

Expected: FAIL because `../stableJson` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

Implement recursive conversion with a `WeakSet<object>` cycle guard. Sort keys
with default code-point `.sort()`. Hash the resulting UTF-16 code units using:

```ts
let hash = 0x811c9dc5
for (let index = 0; index < json.length; index++) {
  hash ^= json.charCodeAt(index)
  hash = Math.imul(hash, 0x01000193)
}
return (hash >>> 0).toString(16).padStart(8, '0')
```

- [ ] **Step 4: Verify the helper**

Run:

```powershell
npx vitest run src/testing/__tests__/stableJson.test.ts
npm run typecheck
```

Expected: all helper tests pass and typecheck exits zero.

- [ ] **Step 5: Commit**

```powershell
git add src/testing/stableJson.ts src/testing/__tests__/stableJson.test.ts
git commit -m "test: add stable document hashing"
```

### Task 3: Machine-readable generation corpus

**Files:**

- Create: `src/testing/generationCorpus.ts`
- Create: `src/generators/__tests__/generationCorpus.test.ts`

**Interfaces:**

- Consumes:

```ts
generateMap(options: GeneratorOptions): GenerationResult
stableHash(value: unknown): string
```

- Produces:

```ts
export interface GenerationCorpusCase {
  id: string
  request: Required<Pick<GeneratorOptions,
    'seed' | 'archetype' | 'subtype' | 'sizeTier' | 'loopiness' | 'danger'>>
}

export interface GenerationCorpusSummary {
  caseId: string
  requestHash: string
  documentHash: string
  roomCount: number
  connectorCount: number
  issueCodes: string[]
  playabilityStatus: string
  facilityStructureStatus: string
  pressureStatus: string
}

export const GENERATION_CORPUS: readonly GenerationCorpusCase[]
export function runGenerationCorpusCase(
  fixture: GenerationCorpusCase
): GenerationCorpusSummary
```

- [ ] **Step 1: Write the fixed requests**

Use three XS fixtures so the baseline stays fast:

```ts
export const GENERATION_CORPUS = [
  {
    id: 'ship-courier-xs',
    request: {
      seed: 'corpus-ship-courier-v1',
      archetype: 'ship',
      subtype: 'courier',
      sizeTier: 'xs',
      loopiness: 0.45,
      danger: 0.3,
    },
  },
  {
    id: 'station-research-xs',
    request: {
      seed: 'corpus-station-research-v1',
      archetype: 'station',
      subtype: 'research',
      sizeTier: 'xs',
      loopiness: 0.55,
      danger: 0.35,
    },
  },
  {
    id: 'outpost-mining-xs',
    request: {
      seed: 'corpus-outpost-mining-v1',
      archetype: 'outpost',
      subtype: 'mining',
      sizeTier: 'xs',
      loopiness: 0.4,
      danger: 0.4,
    },
  },
] as const
```

Before committing, verify subtype values against `src/generators/types.ts`. If a
listed subtype is not valid for its archetype, replace it with the nearest
existing catalog value and document that exact choice in the fixture ID.

- [ ] **Step 2: Write failing corpus tests**

Test:

```ts
describe.each(GENERATION_CORPUS)('$id', fixture => {
  it('is deterministic and satisfies declared semantic status', () => {
    const first = runGenerationCorpusCase(fixture)
    const second = runGenerationCorpusCase(fixture)

    expect(second).toEqual(first)
    expect(first.roomCount).toBeGreaterThan(0)
    expect(first.connectorCount).toBeGreaterThan(0)
    expect(first.playabilityStatus).not.toBe('error')
    expect(first.facilityStructureStatus).not.toBe('error')
    expect(first.pressureStatus).not.toBe('error')
  })
})
```

- [ ] **Step 3: Verify the tests fail**

Run:

```powershell
npx vitest run src/generators/__tests__/generationCorpus.test.ts
```

Expected: FAIL because the corpus module does not exist.

- [ ] **Step 4: Implement normalized summaries**

Call:

```ts
generateMap({
  ...fixture.request,
  engine: 'grid',
  gridCandidateCount: 1,
})
```

Throw an error containing `fixture.id` and generator issue messages if
generation fails or has no map. Before hashing, clone the returned map and
remove only volatile timing and `meta.generatedAt`. Do not remove seed,
candidate-selection data, topology metrics, IDs, or geometry.

Build `issueCodes` from sorted strings:

```ts
result.issues.map(issue =>
  `${issue.severity}:${issue.stage}:${issue.message}`
).sort()
```

- [ ] **Step 5: Verify corpus determinism**

Run:

```powershell
npx vitest run src/generators/__tests__/generationCorpus.test.ts
npm test
```

Expected: corpus and full suite pass twice without changing hashes.

- [ ] **Step 6: Commit**

```powershell
git add src/testing/generationCorpus.ts src/generators/__tests__/generationCorpus.test.ts
git commit -m "test: add deterministic generation corpus"
```

### Task 4: Preserve known failure seeds

**Files:**

- Modify: `src/testing/generationCorpus.ts`
- Modify: `src/generators/__tests__/generationCorpus.test.ts`
- Read: `scripts/reproduce_freeze.ts`
- Read: existing git history and issue documentation for exact failing seeds.

**Interfaces:**

- Consumes: `GenerationCorpusCase` and `runGenerationCorpusCase`.
- Produces:

```ts
export interface GenerationRegressionCase extends GenerationCorpusCase {
  regression: string
}

export const GENERATION_REGRESSIONS: readonly GenerationRegressionCase[]
```

- [ ] **Step 1: Inventory real regressions**

Search:

```powershell
rg -n "seed|freeze|regression|noPath|disconnected|fallback" scripts docs src -g "*.ts" -g "*.md"
git log --all --oneline -- scripts src/generators
```

Expected: a short list of exact reproducible seeds tied to a named historical
failure. Do not invent a regression fixture from a random seed.

- [ ] **Step 2: Add at least one named regression fixture**

For each proven seed, add explicit request fields and a concise `regression`
description such as `worker generation previously stopped making progress`.

- [ ] **Step 3: Add the regression test**

```ts
describe.each(GENERATION_REGRESSIONS)('$id regression', fixture => {
  it(fixture.regression, () => {
    const summary = runGenerationCorpusCase(fixture)
    expect(summary.roomCount).toBeGreaterThan(0)
    expect(summary.connectorCount).toBeGreaterThan(0)
    expect(summary.playabilityStatus).not.toBe('error')
    expect(summary.facilityStructureStatus).not.toBe('error')
  })
})
```

- [ ] **Step 4: Run the targeted and full suites**

Run:

```powershell
npx vitest run src/generators/__tests__/generationCorpus.test.ts
npm run check
```

Expected: all regression fixtures complete and the full check passes.

- [ ] **Step 5: Commit**

```powershell
git add src/testing/generationCorpus.ts src/generators/__tests__/generationCorpus.test.ts
git commit -m "test: preserve generator failure seeds"
```

### Task 5: Active generator ownership ADR

**Files:**

- Create: `docs/architecture/ACTIVE_GENERATOR_ADR.md`
- Modify: `docs/architecture/GENERATOR_SYSTEM.md`
- Modify: `docs/generator/01_generation_pipeline.md`

**Interfaces:**

- Produces a human contract used by Phase 1:
  - occupancy grid is the only target production engine;
  - `quality/pipeline.ts` may provide validators/scoring only after extraction;
  - legacy generator is import/regression compatibility;
  - `MapDocumentV2` is the target canonical document;
  - production dispatch removal belongs to Phase 1, not this task.

- [ ] **Step 1: Write the ADR**

Use sections:

```markdown
# ADR: Active Production Generator

- Status: Accepted
- Date: 2026-07-29

## Context
## Decision
## Current paths and ownership
## Invariants
## Phase 1 migration
## Consequences
## Rejected alternatives
```

List exact current paths:

- `src/generators/generator.ts`
- `src/generators/gridGenerator/occupancyGenerator.ts`
- `src/generators/gridGenerator/candidateSelector.ts`
- `src/generators/quality/pipeline.ts`
- `src/generators/mapGenerator.ts`
- `src/ui/panels/GenerationPanel.tsx`
- `src/workers/generation.worker.ts`

- [ ] **Step 2: Reconcile generator documentation**

Add a visible current-status note to both existing generator documents. It must
state that descriptive legacy stages are historical/compatibility material and
link to the ADR for production ownership.

- [ ] **Step 3: Verify documentation paths and claims**

Run:

```powershell
rg -n "only production|occupancy|quality/pipeline|legacy|Phase 1" docs/architecture/ACTIVE_GENERATOR_ADR.md docs/architecture/GENERATOR_SYSTEM.md docs/generator/01_generation_pipeline.md
```

Expected: every path and ownership statement is explicit; no document claims
that two engines are both the production target.

- [ ] **Step 4: Commit**

```powershell
git add docs/architecture/ACTIVE_GENERATOR_ADR.md docs/architecture/GENERATOR_SYSTEM.md docs/generator/01_generation_pipeline.md
git commit -m "docs: choose the occupancy production generator"
```

### Task 6: CI parity with local checks

**Files:**

- Create: `.github/workflows/check.yml`

**Interfaces:**

- Consumes: `npm ci` and `npm run check`.
- Produces: one Windows-independent Ubuntu CI job on pushes and pull requests.

- [ ] **Step 1: Create the workflow**

Use:

```yaml
name: check

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
```

- [ ] **Step 2: Validate workflow assumptions locally**

Run:

```powershell
node --version
npm ci
npm run check
```

Expected: lockfile installation and the exact CI command pass. Do not manually
edit `package-lock.json` after `npm ci`.

- [ ] **Step 3: Inspect the workflow**

Run:

```powershell
git diff --check
git diff -- .github/workflows/check.yml
```

Expected: no whitespace errors; workflow has read-only contents permission and
no secret-dependent step.

- [ ] **Step 4: Commit**

```powershell
git add .github/workflows/check.yml
git commit -m "ci: run canonical project checks"
```

### Task 7: Phase 0 evidence and final verification

**Files:**

- Modify: `docs/EXECUTION_ROADMAP.md`
- Modify: `docs/DEVELOPMENT_PLAN.md`

**Interfaces:**

- Consumes: passing scripts, corpus tests, ADR, and CI workflow.
- Produces: evidence-linked Phase 0 status without marking Phase 1 complete.

- [ ] **Step 1: Add evidence links**

Under Phase 0, add:

```markdown
**Evidence:**

- Local gate: `npm run check`
- Determinism: `src/generators/__tests__/generationCorpus.test.ts`
- Ownership: `docs/architecture/ACTIVE_GENERATOR_ADR.md`
- CI: `.github/workflows/check.yml`
```

Mark Phase 0 complete only if every listed artifact exists and the local command
passes.

- [ ] **Step 2: Point the legacy status plan to the authoritative roadmap**

At the top of `docs/DEVELOPMENT_PLAN.md`, add a short note that:

- it remains a detailed feature/status inventory;
- `docs/EXECUTION_ROADMAP.md` is authoritative for execution order;
- conflicts are resolved in favor of the roadmap plus accepted ADRs.

- [ ] **Step 3: Run final self-contained verification**

Run:

```powershell
npm run check
git diff --check
git status --short
```

Expected:

- all checks pass;
- only the planned Phase 0 files and pre-existing untracked artifacts appear;
- `.playwright-mcp/` and existing root PNG files remain untracked and unstaged.

- [ ] **Step 4: Commit the evidence update**

```powershell
git add docs/EXECUTION_ROADMAP.md docs/DEVELOPMENT_PLAN.md
git commit -m "docs: record phase zero quality evidence"
```

## Plan completion criteria

Phase 0 is complete only when:

1. `npm run check` is the local and CI quality gate.
2. Three archetypes have deterministic, semantic corpus tests.
3. At least one real historical failure seed is preserved.
4. Production generator ownership is accepted in an ADR.
5. No production behavior or engine toggle has changed yet.
6. Existing untracked screenshots and browser artifacts are untouched.
