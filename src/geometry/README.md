# Geometry kernel

This directory contains renderer-neutral, dependency-free geometry operations.
Canonical maps keep vector `Polygon`/`MultiPolygon` data; occupancy masks are
derived caches for routing and validation.

## Raster contract

- Coordinates and grid configuration must be safe integers.
- Rings may use either winding direction and may repeat their first point.
- A cell is classified at its centre in deterministic row-major order.
- An outer-ring boundary is included.
- A hole boundary is excluded.
- MultiPolygon parts are combined using union semantics.
- Structural voids are combined using union semantics and take precedence over
  the facility envelope.
- Binary masks use `0` for absent and `1` for present.

The mask index for cell `(column, row)` is:

```text
row * width + column
```

`rasterizeFacilityMasks` returns:

- `envelope`: cells covered by the facility envelope;
- `structuralVoids`: cells occupied by any non-usable structural geometry;
- `usable`: `envelope AND NOT structuralVoids`.

Domain-level structural entities marked `traversable: true` must be filtered
before their geometries are passed to `rasterizeFacilityMasks`.
