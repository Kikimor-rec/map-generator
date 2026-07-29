import { describe, expect, it } from 'vitest'
import { createCanvasCustom, fillRect } from '../canvas'
import {
  captureOriginalHullMask,
  validateFacilityStructure,
} from '../facilityValidator'
import { extractFacilityEnvelope, extractStructuralVoids } from '../geometry'
import { generateGridMap } from '../index'
import { TileType } from '../types'

describe('facility structure validation', () => {
  it('detects occupancy that escapes the preserved hull mask', () => {
    const canvas = createCanvasCustom(10, 12, 'ship', 'xs')
    fillRect(canvas, { x: 2, y: 1, width: 6, height: 10 }, TileType.HULL)
    canvas.originalHullMask = captureOriginalHullMask(canvas)

    const safe = validateFacilityStructure(canvas)
    expect(safe.metrics.hullComponentCount).toBe(1)
    expect(safe.metrics.structuralVoidCollisionCount).toBe(0)

    canvas.tiles[0][0] = { type: TileType.FLOOR, roomId: 'escaped-room' }
    const escaped = validateFacilityStructure(canvas)
    expect(escaped.status).toBe('error')
    expect(escaped.metrics.structuralVoidCollisionCount).toBe(1)
    expect(escaped.violations.map(issue => issue.code))
      .toContain('STRUCTURAL_VOID_COLLISION')
  })

  it('rejects disconnected hull islands', () => {
    const canvas = createCanvasCustom(8, 8, 'outpost', 'xs')
    fillRect(canvas, { x: 1, y: 1, width: 2, height: 2 }, TileType.HULL)
    fillRect(canvas, { x: 5, y: 5, width: 2, height: 2 }, TileType.HULL)
    canvas.originalHullMask = captureOriginalHullMask(canvas)

    const report = validateFacilityStructure(canvas)
    expect(report.status).toBe('error')
    expect(report.metrics.hullComponentCount).toBe(2)
    expect(report.violations.map(issue => issue.code))
      .toContain('DISCONNECTED_FACILITY_ENVELOPE')
  })

  it('exports enclosed habitat negative space as explicit structural geometry', () => {
    const result = generateGridMap({
      seed: 'facility-void-export',
      archetype: 'station',
      subtype: 'habitat',
      sizeTier: 'md',
    })

    expect(result.success, result.error).toBe(true)
    const report = validateFacilityStructure(result.canvas!)
    const geometry = result.map!.decks[0].geometry!

    expect(report.metrics.structuralVoidCount).toBeGreaterThan(0)
    expect(geometry.structuralVoids).toHaveLength(report.metrics.structuralVoidCount)
    expect(geometry.structuralVoids).toEqual(extractStructuralVoids(result.canvas!))
    expect(geometry.facilityEnvelope).toEqual(extractFacilityEnvelope(result.canvas!))
  })

  it.each([
    ['ship', 'cargo'],
    ['station', 'research'],
    ['outpost', 'science'],
  ] as const)('records deterministic silhouette metrics for %s', (archetype, subtype) => {
    const options = {
      seed: 'facility-silhouette',
      archetype,
      subtype,
      sizeTier: 'sm' as const,
    }
    const first = generateGridMap(options)
    const second = generateGridMap(options)

    const firstMetrics = first.map!.meta.ttrpgMetrics
    const secondMetrics = second.map!.meta.ttrpgMetrics
    expect(firstMetrics.facilityStructureStatus).not.toBe('error')
    expect(firstMetrics.hullComponentCount).toBe(1)
    expect(firstMetrics.structuralVoidCollisionCount).toBe(0)
    expect(firstMetrics.silhouetteFitScore).toBeGreaterThan(0)
    expect({
      aspect: firstMetrics.hullAspectRatio,
      symmetry: firstMetrics.hullSymmetryPercent,
      fit: firstMetrics.silhouetteFitScore,
    }).toEqual({
      aspect: secondMetrics.hullAspectRatio,
      symmetry: secondMetrics.hullSymmetryPercent,
      fit: secondMetrics.silhouetteFitScore,
    })
  })
})
