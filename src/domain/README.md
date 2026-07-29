# Domain model foundation

`MapDocumentV2` is the renderer-neutral, JSON-safe source of truth introduced
for the envelope-first map pipeline.

Current invariants:

- one grid cell equals exactly 1024 integer geometry units;
- geometry is independent from viewport pixels, zoom and DPI;
- rings are stored open and contain at least three distinct vertices;
- document, envelope, structural void and zone ids are unique;
- format, schema version and unit metadata are checked at runtime boundaries;
- migrations are intentionally kept outside this module.

`src/geometry/types.ts` owns the structural polygon types. The domain layer
re-exports them and adds semantic entities:

- `FacilityEnvelope`;
- `StructuralVoid`;
- `ZonePolygon`.

Runtime schema validation and legacy import migrations will be added under
`src/persistence`; they are not silently inferred by the domain normalizer.
