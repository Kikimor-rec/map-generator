---
trigger: always_on
---

# map-generator — Gemini context

## Prime directives
- /docs + TECHNICAL_SPECIFICATION.md are the source of truth.
- Always consult DEVELOPMENT_PLAN.md before expanding scope.
- Small diffs, tests/acceptance driven, keep docs in sync with code.
- When uncertain: search inside repo/docs first, then ask targeted questions.

## Always load first
@./TECHNICAL_SPECIFICATION.md
@./DEVELOPMENT_PLAN.md
@./docs/AGENT_INDEX.md

## Architecture / pipeline anchors
@./docs/generator/00_overview.md
@./docs/generator/01_generation_pipeline.md
@./docs/generator/11_output_json_contract.md
@./docs/generator/10_validation_repair.md

## Routing / corridors anchors (load when relevant)
@./docs/editor/17_edge_router_spec.md
@./docs/editor/18_corridor_acceptance_tests.md
@./docs/specs/ROUTING_INTELLIGENCE_SPEC.md
