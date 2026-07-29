# Phase 1 One Production Generation Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the occupancy/grid generator the only production generation path used by the product UI and worker, turn Draft/Standard/Polish into deterministic candidate-selection profiles, and isolate historical generators and connector inference behind an explicit compatibility boundary.

**Architecture:** `src/generators/generator.ts` remains the stable production facade but always delegates geometry generation to the occupancy engine through the existing candidate selector. The worker exposes one typed request/response protocol, and the generation panel can only choose a quality profile rather than an engine. Historical legacy and quality-pipeline generation remain callable only through `src/generators/compatibility`. Connector representation becomes explicit in serialized layouts; a single normalizer retains ID-prefix inference solely for old discriminator-free documents. A static import-graph check prevents production UI/worker entry points from reaching competing geometry pipelines.

**Tech Stack:** TypeScript 5.6, React 18, Web Workers, Vite 6, Vitest 4, ESLint 9, npm, GitHub Actions.

## Global Constraints

- Keep the public production entry point `generateMap`; do not add a second production facade.
- Production generation must reach only `gridGenerator`/occupancy geometry. Shared room-program and semantic validation modules are allowed.
- Draft, Standard, and Polish change candidate count and selection effort only; they must not select different geometry implementations.
- Preserve deterministic generation: an explicit seed plus request/profile must produce the same normalized document and candidate-selection result.
- Use the existing hard-gate, Pareto, balanced-score, and numeric-index tie-break policies in `candidateSelector`; do not invent a second score.
- Keep historical legacy and quality generators only for explicit compatibility/regression use. They must not be re-exported from the production barrel.
- New documents must serialize connector representation explicitly. Prefix inference is permitted only inside the historical compatibility normalizer for discriminator-free input.
- Mixed historical decks must normalize each connector independently; never classify the whole deck from one connector or a deck-wide `every(...)`.
- Do not implement `MapDocumentV2`, editable topology, corridor attachment/rerouting, or door manipulation in Phase 1; those remain Phase 2+ work.
- Do not run `npm audit fix` or upgrade dependencies as part of this phase.
- Preserve user-owned untracked screenshots and `.playwright-mcp/` in the main checkout.
- In the nested Windows worktree, use `npx vitest run --maxWorkers=2` for the full local suite when default parallelism causes timeout-only failures. Canonical CI remains `npm run check`.

---

## File structure

Create:

- `src/generators/connectorRepresentation.ts` — explicit connector representation and historical fallback normalizer.
- `src/generators/compatibility/legacyPipeline.ts` — old legacy generation implementation moved out of the production facade.
- `src/generators/compatibility/index.ts` — explicit regression/compatibility-only exports.
- `src/generators/productionProfiles.ts` — Draft/Standard/Polish candidate-count policy.
- `src/workers/generationProtocol.ts` — discriminated worker request/response types.
- `src/workers/generationRuntime.ts` — testable production worker orchestration.
- `src/ui/panels/generationPanelModel.ts` — pure profile labels and request builder.
- `scripts/lib/production-generation-boundary.mjs` — TypeScript import-graph traversal.
- `scripts/verify-production-generation-boundary.mjs` — production entry-point boundary command.
- `scripts/__tests__/production-generation-boundary.test.mjs` — behavioral graph checker tests.
- Tests adjacent to the affected generator, worker, and UI modules as listed below.

Modify:

- `src/generators/types.ts`
- `src/generators/gridGenerator/convert.ts`
- `src/generators/generator.ts`
- `src/generators/gridGenerator/candidateSelector.ts`
- `src/generators/index.ts`
- `src/workers/generation.worker.ts`
- `src/ui/panels/GenerationPanel.tsx`
- `src/testing/generationCorpus.ts`
- `src/generators/__tests__/generationCorpus.test.ts`
- `package.json`
- `docs/architecture/ACTIVE_GENERATOR_ADR.md`
- `docs/architecture/GENERATOR_SYSTEM.md`
- `docs/generator/01_generation_pipeline.md`
- `docs/generator/06_corridors_connectors.md`
- `docs/generator/10_validation_repair.md`
- `docs/generator/11_output_json_contract.md`
- `docs/generator/17_aesthetic_quality_gates.md`
- `docs/EXECUTION_ROADMAP.md`

Do not modify:

- `src/store/EditorContext.tsx` or `src/store/editorStore.ts` data model;
- map document version numbers;
- room movement, corridor rerouting, or door-editing behavior;
- dependency versions.

### Task 1: Explicit connector representation and historical compatibility

**Files:**

- Create: `src/generators/connectorRepresentation.ts`
- Create: `src/generators/__tests__/connectorRepresentation.test.ts`
- Modify: `src/generators/types.ts`
- Modify: `src/generators/gridGenerator/convert.ts`
- Modify: `src/generators/generator.ts`
- Modify: affected adapter tests under `src/generators/__tests__/`

**Interfaces:**

```ts
export type ConnectorRepresentation =
  | 'room-route-v1'
  | 'physical-topology-edge-v1'

export interface LayoutConnector {
  representation?: ConnectorRepresentation
  // existing fields remain unchanged
}

export function normalizeConnectorRepresentation(
  connector: Pick<LayoutConnector, 'id' | 'representation'>,
): ConnectorRepresentation
```

Explicit `representation` always wins. Missing representation falls back to `physical-topology-edge-v1` only for historical `corridor-edge-*` IDs; all other missing values normalize to `room-route-v1`.

- [ ] **Step 1: Write failing representation tests**

Add tests with these behavioral cases:

```ts
it('prefers an explicit physical representation over an arbitrary id', () => {
  expect(normalizeConnectorRepresentation({
    id: 'custom-link',
    representation: 'physical-topology-edge-v1',
  })).toBe('physical-topology-edge-v1')
})

it('does not let a historical-looking id override an explicit room route', () => {
  expect(normalizeConnectorRepresentation({
    id: 'corridor-edge-custom',
    representation: 'room-route-v1',
  })).toBe('room-route-v1')
})

it('recognizes discriminator-free historical grid connectors only in fallback', () => {
  expect(normalizeConnectorRepresentation({ id: 'corridor-edge-3' }))
    .toBe('physical-topology-edge-v1')
  expect(normalizeConnectorRepresentation({ id: 'legacy-connector-3' }))
    .toBe('room-route-v1')
})
```

Add adapter regression fixtures proving:

- an explicit physical connector with an arbitrary ID is rendered as physical topology;
- a legacy connector with an arbitrary non-prefix ID receives legacy route adaptation;
- a mixed deck handles physical and room-route connectors independently;
- existing discriminator-free grid JSON with `corridor-edge-*` remains readable.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/generators/__tests__/connectorRepresentation.test.ts --maxWorkers=2
```

Expected: FAIL because the module and explicit field do not exist.

- [ ] **Step 3: Add the type and normalizer**

Add `ConnectorRepresentation` and optional `representation` to the persisted layout type. Keep it optional solely because historical JSON may omit it. Implement the fallback in the named normalizer; no other production code may inspect `corridor-edge-` prefixes.

- [ ] **Step 4: Stamp every newly generated connector**

In `gridGenerator/convert.ts`, add:

```ts
representation: 'physical-topology-edge-v1'
```

to each physical topology edge. In the extracted legacy pipeline created in Task 2, ensure every legacy route connector is stamped:

```ts
representation: 'room-route-v1'
```

Until Task 2 moves the legacy body, stamp it at the current legacy construction site and preserve that line during extraction.

- [ ] **Step 5: Replace adapter prefix decisions with per-connector normalization**

In `mapJSONToEditorState`, partition each deck’s connectors using `normalizeConnectorRepresentation`. Coalesce only `room-route-v1` connectors. Preserve physical topology connectors independently. Generate endpoint doors only for legacy route connectors, while retaining semantic room-port doors used with physical topology. Remove deck-wide `allPhysicalConnectors` classification.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npx vitest run src/generators/__tests__/connectorRepresentation.test.ts src/generators/__tests__ --maxWorkers=2
npm run typecheck
```

Expected: all generator/adapter tests pass and no prefix test remains outside the compatibility normalizer.

- [ ] **Step 7: Commit**

```powershell
git add src/generators
git commit -m "feat: make connector representation explicit"
```

### Task 2: Production profiles and one occupancy facade

**Files:**

- Create: `src/generators/productionProfiles.ts`
- Create: `src/generators/__tests__/productionProfiles.test.ts`
- Create: `src/generators/compatibility/legacyPipeline.ts`
- Create: `src/generators/compatibility/index.ts`
- Modify: `src/generators/generator.ts`
- Modify: `src/generators/gridGenerator/candidateSelector.ts`
- Modify: `src/generators/index.ts`
- Modify: `src/testing/generationCorpus.ts`
- Modify: `src/generators/__tests__/generationCorpus.test.ts`

**Interfaces:**

```ts
export type GenerationQualityProfile = 'draft' | 'standard' | 'polish'

export interface ProductionProfile {
  candidateCountBySize: Readonly<Record<MapSize, number>>
  requireHardPass: true
}

export const PRODUCTION_PROFILES: Readonly<
  Record<GenerationQualityProfile, ProductionProfile>
>

export function getCandidateCount(
  profile: GenerationQualityProfile,
  size: MapSize,
): number

export interface GeneratorOptions {
  qualityProfile?: GenerationQualityProfile
}

export function generateMap(options: GeneratorOptions): GenerationResult
export async function generateMapAsync(
  options: GeneratorOptions,
  hooks?: CandidateGenerationHooks,
): Promise<GenerationResult>
```

Exact candidate counts:

| Profile | XS | SM | MD | LG | XL |
|---|---:|---:|---:|---:|---:|
| Draft | 1 | 1 | 1 | 1 | 1 |
| Standard | 4 | 4 | 3 | 2 | 2 |
| Polish | 8 | 8 | 6 | 4 | 4 |

- [ ] **Step 1: Write failing profile and facade tests**

Test the exact table, immutable profile keys, and default `standard` profile. Add a facade test that spies on the occupancy candidate selector module and asserts all three profiles call it with the expected count. Add a compile-time/runtime request test proving `engine`, `useQuality`, and `gridCandidateCount` are not accepted production options.

Add a compatibility test that imports legacy generation only from:

```ts
import { generateLegacyMapForRegression } from '../compatibility'
```

and verify the production barrel no longer exports `MapGenerator`, legacy presets, topology/layout generators, or quality pipeline.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/generators/__tests__/productionProfiles.test.ts --maxWorkers=2
```

Expected: FAIL because production profiles and single-path facade do not exist.

- [ ] **Step 3: Implement profiles over the existing selector**

Create the exact frozen profile table. Make `generateMap` and `generateMapAsync` resolve the requested/default profile and always call the existing candidate selector, including Draft with one candidate. Keep:

1. hard-gate evaluation;
2. Pareto frontier;
3. balanced score;
4. numeric candidate-index tie-break.

Do not use old quality-pipeline `qualityThreshold` values or elapsed-time budgets.

- [ ] **Step 4: Extract legacy generation behind compatibility**

Move the legacy branch and its private helpers from `generator.ts` into `compatibility/legacyPipeline.ts`. Give the function the explicit name `generateLegacyMapForRegression`. Export it, old `MapGenerator`/presets, and any retained quality pipeline entry only from `compatibility/index.ts`. Remove all competing geometry exports from `src/generators/index.ts`.

The production facade must contain no engine switch and no imports from:

- `quality/pipeline`;
- `mapGenerator`;
- `layout`;
- `topology`;
- `skeletonGenerator` or `skeletonGeneratorV2`.

- [ ] **Step 5: Freeze the three-archetype corpus through the new facade**

Update the existing ship/station/outpost corpus requests to specify `qualityProfile: 'standard'`. Regenerate expected normalized summaries only after reviewing:

- request/profile metadata;
- room, connector, and door counts;
- candidate-selection count and winning index;
- deterministic document hash for a second identical call.

The three corpus fixtures must all import and call the same `generateMap` entry point.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npx vitest run src/generators/__tests__/productionProfiles.test.ts src/generators/__tests__/generationCorpus.test.ts --maxWorkers=2
npm run typecheck
```

Expected: exact profile tests and all three archetype corpus cases pass.

- [ ] **Step 7: Commit**

```powershell
git add src/generators src/testing
git commit -m "refactor: use one occupancy production facade"
```

### Task 3: Typed single-path worker protocol

**Files:**

- Create: `src/workers/generationProtocol.ts`
- Create: `src/workers/generationRuntime.ts`
- Create: `src/workers/__tests__/generationRuntime.test.ts`
- Modify: `src/workers/generation.worker.ts`

**Interfaces:**

```ts
export type GenerationWorkerRequest =
  | {
      type: 'GENERATE'
      requestId: string
      options: GeneratorOptions
    }
  | {
      type: 'CANCEL'
      requestId: string
    }

export type GenerationWorkerResponse =
  | {
      type: 'PROGRESS'
      requestId: string
      progress: number
      stage: string
    }
  | {
      type: 'COMPLETE'
      requestId: string
      format: 'map-json-v1'
      map: MapJSON
    }
  | {
      type: 'ERROR'
      requestId: string
      message: string
    }
  | {
      type: 'CANCELLED'
      requestId: string
    }
```

`generationRuntime.ts` accepts a typed request and an injected `postMessage` callback, invokes only `generateMapAsync`, maps candidate progress to protocol messages, and returns a single MapJSON shape.

- [ ] **Step 1: Write failing runtime tests**

Add tests that:

- pass a Draft ship request and receive `COMPLETE` with `format: 'map-json-v1'`;
- assert `COMPLETE.map` is a real MapJSON and has no `bestCandidate`;
- verify Standard routes through the same injected production generator as Draft;
- cancel a matching request and receive `CANCELLED`;
- reject obsolete payloads containing `useQuality`, `qualityMode`, or `engine`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/workers/__tests__/generationRuntime.test.ts --maxWorkers=2
```

Expected: FAIL because the typed protocol/runtime do not exist.

- [ ] **Step 3: Implement the typed runtime**

Keep cancellation state scoped by `requestId`. Support progress via the existing async candidate-selector hooks. Convert thrown values to a stable message without returning `any`.

- [ ] **Step 4: Reduce the worker file to transport wiring**

`generation.worker.ts` must:

- import the protocol and runtime;
- parse only `GenerationWorkerRequest`;
- never import `runQualityPipeline`;
- never inspect an engine;
- never return `bestCandidate`;
- use `DedicatedWorkerGlobalScope` typing rather than `any`.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npx vitest run src/workers/__tests__/generationRuntime.test.ts --maxWorkers=2
npm run typecheck
```

Expected: worker behavior tests and typecheck pass.

- [ ] **Step 6: Commit**

```powershell
git add src/workers
git commit -m "refactor: type the single-path generation worker"
```

### Task 4: One-engine Generation Panel and gallery

**Files:**

- Create: `src/ui/panels/generationPanelModel.ts`
- Create: `src/ui/panels/__tests__/generationPanelModel.test.ts`
- Modify: `src/ui/panels/GenerationPanel.tsx`

**Interfaces:**

```ts
export interface GenerationProfileOption {
  id: GenerationQualityProfile
  label: string
  candidateCount: number
  description: string
}

export function getGenerationProfileOptions(
  size: MapSize,
): readonly GenerationProfileOption[]

export function buildGenerationWorkerRequest(
  requestId: string,
  form: GenerationFormState,
): Extract<GenerationWorkerRequest, { type: 'GENERATE' }>
```

- [ ] **Step 1: Write failing panel-model tests**

Test that:

- the options are exactly Draft, Standard, Polish;
- displayed counts change by size using the production profile table;
- every description mentions hard-gate selection and the actual candidate count;
- the request builder emits only `requestId`, standard generation inputs, and `qualityProfile`;
- serialized requests contain none of `engine`, `useQuality`, `qualityMode`, `routing`, or `gridCandidateCount`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/ui/panels/__tests__/generationPanelModel.test.ts --maxWorkers=2
```

Expected: FAIL because the pure panel model does not exist.

- [ ] **Step 3: Replace UI engine controls with profile controls**

In `GenerationPanel.tsx`:

- remove `useQualityPipeline`, `generatorEngine`, quality-pipeline mode/config imports, and the checkbox;
- always render Draft/Standard/Polish profile selection;
- describe them as selection effort, not separate algorithms;
- build worker messages through `buildGenerationWorkerRequest`;
- type messages as `GenerationWorkerResponse`;
- accept only `COMPLETE.format === 'map-json-v1'` and read `message.map`;
- remove `bestCandidate` shape guessing and legacy/quality conditionals.

- [ ] **Step 4: Put gallery generation on the same facade**

Generate each gallery candidate via `generateMap` with the selected form inputs and `qualityProfile: 'draft'` for its derived seed. Rank the returned occupancy maps with the existing grid-candidate ranking helper. Remove legacy scoring and legacy engine conditions. Gallery variety comes from derived seeds, not an alternate generator.

- [ ] **Step 5: Remove inert routing controls from generation**

Remove generation-panel controls and payload fields that claim to choose diagonal or orthogonal legacy routing but do not affect occupancy generation. Do not remove editor-side corridor rendering options that are outside this panel.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npx vitest run src/ui/panels/__tests__/generationPanelModel.test.ts --maxWorkers=2
npm run lint
npm run typecheck
```

Expected: panel model tests, lint, and typecheck pass with no obsolete state/imports.

- [ ] **Step 7: Commit**

```powershell
git add src/ui/panels
git commit -m "refactor: expose generation profiles instead of engines"
```

### Task 5: Enforce the production import boundary

**Files:**

- Create: `scripts/lib/production-generation-boundary.mjs`
- Create: `scripts/verify-production-generation-boundary.mjs`
- Create: `scripts/__tests__/production-generation-boundary.test.mjs`
- Modify: `package.json`

**Interfaces:**

```js
export async function findForbiddenProductionImports({
  rootDir,
  entryPoints,
  forbiddenFragments,
}) {
  // returns [{ entryPoint, forbiddenModule, importChain }]
}
```

Production entry points:

- `src/ui/panels/GenerationPanel.tsx`
- `src/workers/generation.worker.ts`

Forbidden geometry fragments:

- `src/generators/quality/pipeline`
- `src/generators/mapGenerator`
- `src/generators/compatibility/legacyPipeline`
- `src/generators/layout`
- `src/generators/topology`
- `src/generators/skeletonGenerator`
- `src/generators/skeletonGeneratorV2`

Shared `roomProgram`, validation, metrics, adapter, and occupancy modules remain allowed.

- [ ] **Step 1: Write behavioral graph-checker tests**

Use temporary fixture modules and assert:

```js
it('reports a transitive forbidden import with the full chain', async () => {
  // entry -> facade -> compatibility/legacyPipeline
})

it('allows the production entry to reach occupancy and shared roomProgram', async () => {
  // entry -> facade -> gridGenerator and roomProgram
})
```

Also test relative imports, `@/` aliases, `.ts`/`.tsx` extension resolution, and `export ... from` edges. Do not test by grepping source text.

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test scripts/__tests__/production-generation-boundary.test.mjs
```

Expected: FAIL because the graph checker does not exist.

- [ ] **Step 3: Implement TypeScript-aware traversal**

Use the installed `typescript` package’s `preProcessFile` to collect imported and re-exported modules. Resolve local relative and `@/` paths against the repository root, try supported TypeScript extensions and `index` files, track visited nodes, and return a stable sorted violation list with the shortest discovered chain.

- [ ] **Step 4: Add the repository verifier**

The CLI command must print each violation as:

```text
entry -> intermediate -> forbidden
```

and exit non-zero if any forbidden module is reachable. On success, print the checked entry-point count and `production generator boundary: ok`.

- [ ] **Step 5: Wire the check into the canonical gate**

Add:

```json
"check:generator-boundary": "node scripts/verify-production-generation-boundary.mjs",
"check": "npm run test && npm run lint && npm run typecheck && npm run check:generator-boundary && npm run build"
```

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
node --test scripts/__tests__/production-generation-boundary.test.mjs
npm run check:generator-boundary
```

Expected: fixture tests pass and both production entry points have no path to competing geometry.

- [ ] **Step 7: Commit**

```powershell
git add scripts package.json package-lock.json
git commit -m "test: enforce one production generator path"
```

### Task 6: Documentation, complete verification, and evidence

**Files:**

- Modify: `docs/architecture/ACTIVE_GENERATOR_ADR.md`
- Modify: `docs/architecture/GENERATOR_SYSTEM.md`
- Modify: `docs/generator/01_generation_pipeline.md`
- Modify: `docs/generator/06_corridors_connectors.md`
- Modify: `docs/generator/10_validation_repair.md`
- Modify: `docs/generator/11_output_json_contract.md`
- Modify: `docs/generator/17_aesthetic_quality_gates.md`
- Modify: `docs/EXECUTION_ROADMAP.md`

- [ ] **Step 1: Update architecture ownership**

Record:

- occupancy/grid is the only product generation engine;
- Draft/Standard/Polish are candidate-selection profiles with the exact size table;
- worker and UI share one facade/protocol;
- legacy and quality pipeline are compatibility/regression-only;
- production import graph is machine-enforced;
- candidate selection remains deterministic and hard-gated.

- [ ] **Step 2: Document connector representation**

Document both serialized values, explicit-wins normalization, historical prefix fallback, and mixed-deck per-connector behavior. State that new documents always include the discriminator and that `MapDocumentV2` migration remains Phase 2.

- [ ] **Step 3: Update the roadmap truthfully**

Mark Phase 1 implementation complete locally only after the full local gate passes. Record exact commands and counts. Keep remote CI status as pending until a real pushed run is available; never write a fabricated URL or status.

- [ ] **Step 4: Run targeted verification**

Run:

```powershell
npx vitest run src/generators/__tests__/connectorRepresentation.test.ts src/generators/__tests__/productionProfiles.test.ts src/generators/__tests__/generationCorpus.test.ts src/workers/__tests__/generationRuntime.test.ts src/ui/panels/__tests__/generationPanelModel.test.ts --maxWorkers=2
node --test scripts/__tests__/production-generation-boundary.test.mjs
npm run check:generator-boundary
```

Expected: all targeted contracts pass and the boundary verifier reports two clean production entry points.

- [ ] **Step 5: Run the complete local gate**

Run:

```powershell
npx vitest run --maxWorkers=2
npm run lint
npm run typecheck
npm run check:generator-boundary
npm run build
```

Then run the canonical command:

```powershell
npm run check
```

If only default-parallel Vitest timeouts occur in the nested worktree, preserve the passing two-worker full-suite evidence and run canonical `npm run check` in the main checkout or CI. Do not weaken individual assertions or raise timeouts without an identified product reason.

- [ ] **Step 6: Review the diff and retained compatibility surface**

Run:

```powershell
git diff --check
git status --short
git diff --stat
rg -n "useQuality|qualityMode|generatorEngine|engine: 'legacy'|bestCandidate|startsWith\\('corridor-edge-'" src/ui src/workers src/generators
```

Expected:

- no whitespace errors;
- no user-facing alternative-engine switches;
- no worker shape guessing;
- the only `corridor-edge-` inference is in `connectorRepresentation.ts`;
- legacy/quality calls exist only under explicit compatibility or regression tests.

- [ ] **Step 7: Commit documentation**

```powershell
git add docs
git commit -m "docs: record the single production generation path"
```

- [ ] **Step 8: Final review/fix wave**

Have one fresh reviewer inspect:

- production import reachability;
- type/protocol consistency;
- compatibility fixtures;
- deterministic corpus evidence;
- docs against actual code.

Apply any required fixes through a dedicated fix task, rerun the affected targeted tests and the complete gate, then commit fixes with a narrowly scoped message.

- [ ] **Step 9: Push and record CI evidence when authorized**

Push `codex/phase1-one-production-path`, wait for GitHub Actions, and only then update roadmap evidence with the actual commit SHA, run URL, conclusion, and test count. If the documentation-only evidence commit triggers a second run, record the final run for that commit.

## Phase 1 acceptance gate

Phase 1 is complete only when all statements are true:

- UI and worker production import graphs reach one geometry generator: occupancy/grid.
- No user-facing or worker payload switch can select legacy or quality-pipeline geometry.
- Draft/Standard/Polish use the documented deterministic candidate counts and existing hard-gate/Pareto selector.
- Ship, station, and outpost corpus fixtures call the same facade and pass deterministic summaries.
- Newly generated connectors carry explicit representation.
- Historical prefix-free legacy, historical prefixed grid, explicit arbitrary-ID physical, and mixed-deck fixtures remain readable.
- The production boundary checker is part of `npm run check`.
- Tests, lint, typecheck, boundary check, and build pass.
- Architecture and roadmap documentation match the implemented code and distinguish local from CI evidence.
