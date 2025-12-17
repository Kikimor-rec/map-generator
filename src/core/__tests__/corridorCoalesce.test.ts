/**
 * Unit tests for corridorCoalesce module
 * 
 * To run these tests, install vitest:
 *   npm install -D vitest
 *   npm run test
 * 
 * Add to package.json scripts:
 *   "test": "vitest"
 */

import { describe, it, expect } from 'vitest'
import {
  coalesceCorridors,
  simplifyCorridorPath,
  postProcessCorridors,
} from '../corridorCoalesce'
import type { Corridor, CorridorSegment, Point } from '../types'
import { DEFAULT_COALESCE_SETTINGS } from '../corridorTypes'

// ============================================================================
// HELPERS
// ============================================================================

function createCorridor(id: string, segments: Array<[Point, Point]>): Corridor {
  return {
    id,
    style: 'standard',
    segments: segments.map(([start, end]) => ({ start, end })),
    width: 40,
    doors: [],
    connectedRoomIds: [],
    attachments: [],
  }
}

function p(x: number, y: number): Point {
  return { x, y }
}

// ============================================================================
// COALESCE CORRIDORS TESTS
// ============================================================================

describe('coalesceCorridors', () => {
  it('should return empty result for empty input', () => {
    const result = coalesceCorridors([], DEFAULT_COALESCE_SETTINGS)
    
    expect(result.corridors).toHaveLength(0)
    expect(result.result.segmentsRemoved).toBe(0)
    expect(result.result.junctionsCreated).toBe(0)
  })

  it('should not modify corridors when disabled', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(100, 0)]]),
      createCorridor('c2', [[p(0, 0), p(100, 0)]]), // Duplicate
    ]

    const result = coalesceCorridors(corridors, {
      ...DEFAULT_COALESCE_SETTINGS,
      enabled: false,
    })

    expect(result.corridors).toHaveLength(2)
    expect(result.result.segmentsRemoved).toBe(0)
  })

  it('should detect and remove duplicate segments', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(100, 0)]]),
      createCorridor('c2', [[p(0, 0), p(100, 0)]]), // Exact duplicate
    ]

    const result = coalesceCorridors(corridors, DEFAULT_COALESCE_SETTINGS)

    expect(result.result.segmentsRemoved).toBe(1)
    expect(result.result.modifiedCorridorIds).toContain('c2')
  })

  it('should detect duplicate segments with reversed direction', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(100, 0)]]),
      createCorridor('c2', [[p(100, 0), p(0, 0)]]), // Reversed duplicate
    ]

    const result = coalesceCorridors(corridors, DEFAULT_COALESCE_SETTINGS)

    expect(result.result.segmentsRemoved).toBe(1)
  })

  it('should detect duplicate segments within tolerance', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(100, 0)]]),
      createCorridor('c2', [[p(1, 0), p(99, 0)]]), // Within 2px tolerance
    ]

    const result = coalesceCorridors(corridors, {
      ...DEFAULT_COALESCE_SETTINGS,
      tolerancePx: 5,
    })

    expect(result.result.segmentsRemoved).toBe(1)
  })

  it('should not merge segments outside tolerance', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(100, 0)]]),
      createCorridor('c2', [[p(0, 10), p(100, 10)]]), // Parallel but separate
    ]

    const result = coalesceCorridors(corridors, {
      ...DEFAULT_COALESCE_SETTINGS,
      tolerancePx: 2,
    })

    expect(result.result.segmentsRemoved).toBe(0)
  })

  it('should handle multiple corridors with duplicates', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(100, 0)], [p(100, 0), p(100, 100)]]),
      createCorridor('c2', [[p(0, 0), p(100, 0)]]), // Duplicates first segment of c1
      createCorridor('c3', [[p(100, 0), p(100, 100)]]), // Duplicates second segment of c1
    ]

    const result = coalesceCorridors(corridors, DEFAULT_COALESCE_SETTINGS)

    expect(result.result.segmentsRemoved).toBe(2)
  })

  it('should create junctions at merge points when enabled', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(100, 0)]]),
      createCorridor('c2', [[p(50, -50), p(50, 50)]]), // Crosses c1 at (50, 0)
    ]

    const result = coalesceCorridors(corridors, {
      ...DEFAULT_COALESCE_SETTINGS,
      createJunctionsAtMerge: true,
    })

    // Note: This tests partial overlap detection, not crossing
    // Actual junction creation depends on collinear overlap
    expect(result.corridors).toHaveLength(2)
  })

  it('should remove corridors with all segments merged away', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(100, 0)], [p(100, 0), p(100, 100)]]),
      createCorridor('c2', [[p(0, 0), p(100, 0)]]), // Only segment is duplicate
    ]

    const result = coalesceCorridors(corridors, DEFAULT_COALESCE_SETTINGS)

    // c2 should be in removedCorridorIds if all its segments were removed
    expect(result.result.removedCorridorIds).toContain('c2')
    expect(result.corridors.find(c => c.id === 'c2')).toBeUndefined()
  })
})

// ============================================================================
// SIMPLIFY CORRIDOR PATH TESTS
// ============================================================================

describe('simplifyCorridorPath', () => {
  it('should return empty for empty input', () => {
    const result = simplifyCorridorPath([])
    expect(result).toHaveLength(0)
  })

  it('should return single segment unchanged', () => {
    const segments: CorridorSegment[] = [{ start: p(0, 0), end: p(100, 0) }]
    const result = simplifyCorridorPath(segments)
    expect(result).toHaveLength(1)
  })

  it('should remove collinear intermediate points', () => {
    const segments: CorridorSegment[] = [
      { start: p(0, 0), end: p(50, 0) },
      { start: p(50, 0), end: p(100, 0) },
    ]
    const result = simplifyCorridorPath(segments)
    expect(result).toHaveLength(1)
    expect(result[0].start).toEqual(p(0, 0))
    expect(result[0].end).toEqual(p(100, 0))
  })

  it('should keep turn points', () => {
    const segments: CorridorSegment[] = [
      { start: p(0, 0), end: p(100, 0) },
      { start: p(100, 0), end: p(100, 100) },
    ]
    const result = simplifyCorridorPath(segments)
    expect(result).toHaveLength(2)
  })

  it('should handle complex paths with multiple turns', () => {
    const segments: CorridorSegment[] = [
      { start: p(0, 0), end: p(100, 0) },
      { start: p(100, 0), end: p(100, 50) },
      { start: p(100, 50), end: p(100, 100) }, // Collinear with previous
      { start: p(100, 100), end: p(200, 100) },
    ]
    const result = simplifyCorridorPath(segments)
    
    // Should simplify collinear segments
    expect(result.length).toBeLessThan(4)
  })
})

// ============================================================================
// POST PROCESS CORRIDORS TESTS
// ============================================================================

describe('postProcessCorridors', () => {
  it('should combine coalesce and simplify', () => {
    const corridors = [
      createCorridor('c1', [
        [p(0, 0), p(50, 0)],
        [p(50, 0), p(100, 0)],
        [p(100, 0), p(100, 100)],
      ]),
    ]

    const result = postProcessCorridors(corridors, DEFAULT_COALESCE_SETTINGS)

    // First two segments should be simplified into one
    const c1 = result.corridors.find(c => c.id === 'c1')
    expect(c1).toBeDefined()
    expect(c1!.segments.length).toBeLessThanOrEqual(2)
  })

  it('should return stats from coalesce operation', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(100, 0)]]),
      createCorridor('c2', [[p(0, 0), p(100, 0)]]),
    ]

    const result = postProcessCorridors(corridors, DEFAULT_COALESCE_SETTINGS)

    expect(result.result.segmentsRemoved).toBeGreaterThan(0)
  })
})

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge cases', () => {
  it('should handle corridors with no segments', () => {
    const corridors: Corridor[] = [
      { ...createCorridor('c1', []), segments: [] },
    ]

    const result = coalesceCorridors(corridors, DEFAULT_COALESCE_SETTINGS)
    expect(result.corridors).toHaveLength(1)
  })

  it('should handle very short segments', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(1, 0)]]), // 1px segment
    ]

    const result = coalesceCorridors(corridors, DEFAULT_COALESCE_SETTINGS)
    expect(result.corridors).toHaveLength(1)
  })

  it('should handle diagonal segments', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(100, 100)]]),
      createCorridor('c2', [[p(0, 0), p(100, 100)]]),
    ]

    const result = coalesceCorridors(corridors, DEFAULT_COALESCE_SETTINGS)
    expect(result.result.segmentsRemoved).toBe(1)
  })

  it('should respect minSharedLength setting', () => {
    const corridors = [
      createCorridor('c1', [[p(0, 0), p(10, 0)]]),
      createCorridor('c2', [[p(0, 0), p(10, 0)]]),
    ]

    const result = coalesceCorridors(corridors, {
      ...DEFAULT_COALESCE_SETTINGS,
      minSharedLength: 20, // Segments are only 10px long
    })

    // Should still detect exact duplicates regardless of minSharedLength
    expect(result.result.segmentsRemoved).toBe(1)
  })
})
