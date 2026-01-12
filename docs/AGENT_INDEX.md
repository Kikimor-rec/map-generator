# AGENT_INDEX — Map Generator (docs map + priorities)

## Priorities (source of truth)
1) TECHNICAL_SPECIFICATION.md (корень) — основные требования
2) docs/specs/*.md и docs/editor/*_spec.md — спецификации поведения
3) docs/generator/*.md — архитектура и пайплайн генерации
4) DEVELOPMENT_PLAN.md — приоритеты/этапы/границы задач
5) docs/generator/18_corridor_acceptance_tests.md (и любые acceptance/validation docs) — “oracle” качества
6) TODO_CLEAN.md — вторичные задачи/долг (не должен ломать приоритеты)

## Entry points (прочитать в первую очередь, если не знаешь с чего начать)
- docs/generator/00_overview.md
- docs/generator/01_generation_pipeline.md
- docs/generator/11_output_json_contract.md
- docs/generator/10_validation_repair.md

## Topic routing (какие docs читать по задачам)

### Corridors / routing / intersections / loop logic
- docs/editor/16_corridor_editor_spec.md
- docs/editor/17_edge_router_spec.md
- docs/editor/18_corridor_acceptance_tests.md
- docs/specs/ROUTING_INTELLIGENCE_SPEC.md
- docs/generator/04_topology_graph.md
- docs/generator/05_layout_geometry.md
- docs/generator/06_corridors_connectors.md
- docs/generator/10_validation_repair.md
- docs/generator/11_output_json_contract.md

### Input parameters, configs, profiles
- docs/generator/02_input_parameters.md
- docs/generator/09_profiles_realism_futurism.md
- docs/generator/14_config_templates.md

### Room program, types, archetypes
- docs/generator/03_room_program.md
- docs/generator/12_room_type_catalog.md
- docs/generator/13_archetypes_subtypes.md

### Decks/layers
- docs/generator/07_multideck_layers.md

### TTRPG metrics / quality targets
- docs/generator/08_ttrpg_metrics.md
- docs/generator/15_examples.md

## Definition of Done (agent must satisfy)
- Изменение соответствует релевантным docs (перечислить “Docs consulted”).
- Нет противоречий с JSON contract (если затрагивается output).
- Добавлены/обновлены тесты или acceptance-проверки, если менялось поведение.
- Если изменилось поведение — обновлены docs (минимум: соответствующий раздел + пример).

## How to handle docs ↔ code mismatch
Если docs и код расходятся:
- Указать точное место расхождения (файл + секция).
- Предложить два пути: (A) привести код к docs, (B) обновить docs.
- Выбрать один путь и сделать патч.

## Research notes
Все внешние идеи фиксируются в docs/research/ (короткие заметки со ссылками и выводом),
и только после этого отражаются в specs/коде.
