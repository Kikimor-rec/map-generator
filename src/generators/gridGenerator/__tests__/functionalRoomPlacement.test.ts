import { describe, expect, it } from 'vitest'
import {
  rankFunctionalRoomSlots,
  scoreFunctionalRoomSlot,
  type FunctionalPlacementContext,
  type FunctionalRoomSlotCandidate,
} from '../functionalRoomPlacement'

const shipContext: FunctionalPlacementContext = {
  archetype: 'ship',
  subtype: 'cargo',
  width: 40,
  height: 100,
  facilityBounds: { x: 5, y: 5, width: 30, height: 90 },
}

const stationContext: FunctionalPlacementContext = {
  archetype: 'station',
  subtype: 'habitat',
  width: 100,
  height: 100,
}

const outpostContext: FunctionalPlacementContext = {
  archetype: 'outpost',
  subtype: 'research',
  width: 100,
  height: 80,
}

function slot(
  id: string,
  x: number,
  y: number,
  options: Partial<FunctionalRoomSlotCandidate> = {}
): FunctionalRoomSlotCandidate {
  return {
    id,
    rect: { x, y, width: 6, height: 6 },
    ...options,
  }
}

describe('functional room placement grammar', () => {
  it('places ship command at the bow and engineering at the stern', () => {
    const bow = slot('bow', 17, 8, { zoneId: 'command' })
    const stern = slot('stern', 17, 84, { zoneId: 'engineering' })

    expect(scoreFunctionalRoomSlot('bridge', bow, shipContext).score)
      .toBeGreaterThan(scoreFunctionalRoomSlot('bridge', stern, shipContext).score)
    expect(scoreFunctionalRoomSlot('reactor', stern, shipContext).score)
      .toBeGreaterThan(scoreFunctionalRoomSlot('reactor', bow, shipContext).score)
  })

  it('strongly prefers exterior access for ship cargo and airlocks', () => {
    const interior = slot('interior', 17, 58, {
      zoneId: 'operations',
      touchesExterior: false,
    })
    const exterior = slot('exterior', 6, 58, {
      zoneId: 'operations',
      touchesExterior: true,
    })

    expect(scoreFunctionalRoomSlot('cargoBay', exterior, shipContext).score)
      .toBeGreaterThan(scoreFunctionalRoomSlot('cargoBay', interior, shipContext).score)
    expect(scoreFunctionalRoomSlot('airlock', exterior, shipContext).score)
      .toBeGreaterThan(scoreFunctionalRoomSlot('airlock', interior, shipContext).score + 100)
  })

  it('separates station hub, habitation ring, and docking perimeter', () => {
    const hub = slot('hub', 47, 47, { zoneId: 'hub', touchesExterior: false })
    const ring = slot('ring', 78, 47, { zoneId: 'residential', touchesExterior: false })
    const perimeter = slot('perimeter', 93, 47, { zoneId: 'docking', touchesExterior: true })

    expect(rankFunctionalRoomSlots('bridge', [perimeter, ring, hub], stationContext)[0].slot.id)
      .toBe('hub')
    expect(rankFunctionalRoomSlots('quarters', [hub, perimeter, ring], stationContext)[0].slot.id)
      .toBe('ring')
    expect(rankFunctionalRoomSlots('dockingBay', [hub, ring, perimeter], stationContext)[0].slot.id)
      .toBe('perimeter')
  })

  it('uses optional outpost module metadata while retaining geometric fallback', () => {
    const hub = slot('hub', 47, 37, {
      zoneId: 'main',
      moduleRole: 'hub',
      moduleKind: 'command',
    })
    const scienceSatellite = slot('science', 76, 15, {
      zoneId: 'specialized',
      moduleRole: 'satellite',
      moduleKind: 'science',
    })
    const utilitySatellite = slot('utility', 76, 55, {
      zoneId: 'support',
      moduleRole: 'satellite',
      moduleKind: 'utility',
    })

    expect(rankFunctionalRoomSlots('bridge', [scienceSatellite, hub], outpostContext)[0].slot.id)
      .toBe('hub')
    expect(rankFunctionalRoomSlots('scienceLab', [hub, utilitySatellite, scienceSatellite], outpostContext)[0].slot.id)
      .toBe('science')
    expect(rankFunctionalRoomSlots('reactor', [hub, scienceSatellite, utilitySatellite], outpostContext)[0].slot.id)
      .toBe('utility')

    const geometricHub = slot('geometric-hub', 47, 37, { zoneId: 'main' })
    const geometricSatellite = slot('geometric-satellite', 80, 8, { zoneId: 'specialized' })
    expect(rankFunctionalRoomSlots('bridge', [geometricSatellite, geometricHub], outpostContext)[0].slot.id)
      .toBe('geometric-hub')
  })

  it('returns explanatory factors and a stable tie-break order', () => {
    const right = slot('right', 60, 20, { zoneId: 'crew' })
    const left = slot('left', 20, 20, { zoneId: 'crew' })
    const scored = scoreFunctionalRoomSlot('quarters', left, shipContext)
    const ranked = rankFunctionalRoomSlots('quarters', [right, left], shipContext)

    expect(scored.factors.some(factor => factor.rule === 'preferred-functional-zone')).toBe(true)
    expect(ranked.map(candidate => candidate.slot.id)).toEqual(['left', 'right'])
    expect(rankFunctionalRoomSlots('quarters', [right, left], shipContext))
      .toEqual(rankFunctionalRoomSlots('quarters', [right, left], shipContext))
  })

  it('moderately prefers short corridor stubs without overriding validity', () => {
    const close = slot('close', 20, 40, {
      zoneId: 'crew',
      connectionDistance: 1,
    })
    const far = slot('far', 20, 40, {
      zoneId: 'crew',
      connectionDistance: 7,
    })
    const closeScore = scoreFunctionalRoomSlot('quarters', close, shipContext)
    const farScore = scoreFunctionalRoomSlot('quarters', far, shipContext)

    expect(closeScore.score).toBeGreaterThan(farScore.score)
    expect(closeScore.score - farScore.score).toBe(24)
    expect(farScore.factors).toContainEqual({
      rule: 'short-corridor-stub',
      value: -24,
    })
  })
})
