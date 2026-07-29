import { describe, expect, it } from 'vitest'
import {
  classifyDoor,
  type DoorClassificationInput,
  type DoorRoomContext,
} from '../doorClassifier'

const CREW_ROOM: DoorRoomContext = {
  id: 'crew-1',
  roomType: 'crewQuarters',
  zone: 'residential',
  accessLevel: 1,
}

function classify(
  overrides: Partial<DoorClassificationInput> = {}
) {
  return classifyDoor({
    connectionId: 'connector-1',
    room: CREW_ROOM,
    neighbor: {
      id: 'mess-1',
      roomType: 'messHall',
      zone: 'residential',
      accessLevel: 1,
    },
    exteriorProximity: 'interior',
    ...overrides,
  })
}

describe('doorClassifier', () => {
  it('classifies an ordinary same-zone crew connection as standard', () => {
    expect(classify()).toEqual({
      semantic: 'standard',
      connectorKind: 'door',
      access: {
        version: 1,
        accessId: 'connector-1:door-access:v1',
        requiredLevel: 1,
        requiredAccess: 'crew',
        lockLevel: 0,
        failsafe: true,
        lockedByDefault: false,
        pressureBoundary: false,
        interlocked: false,
        checkpoint: false,
        reasons: ['ordinary-interior'],
      },
    })
  })

  it('gives a true exterior boundary airlock precedence over security', () => {
    const result = classify({
      room: {
        id: 'armory-1',
        roomType: 'armory',
        zone: 'security',
        accessLevel: 3,
        isExterior: true,
      },
      neighbor: undefined,
      exteriorProximity: 'boundary',
    })

    expect(result.semantic).toBe('airlock')
    expect(result.connectorKind).toBe('airlock')
    expect(result.access).toMatchObject({
      requiredLevel: 3,
      requiredAccess: 'secure',
      lockLevel: 3,
      pressureBoundary: true,
      interlocked: true,
      checkpoint: false,
    })
    expect(result.access.reasons).toEqual([
      'exterior-boundary',
      'exterior-egress',
    ])
  })

  it('classifies an airlock chamber connection as airlock', () => {
    const result = classify({
      room: {
        id: 'airlock-1',
        roomType: 'Air Lock',
        zone: 'docking',
        accessLevel: 1,
        isExterior: true,
      },
      exteriorProximity: 'near-hull',
    })

    expect(result.semantic).toBe('airlock')
    expect(result.access.reasons).toEqual(['airlock-room'])
  })

  it('creates a secure checkpoint for a two-level access transition', () => {
    const result = classify({
      neighbor: {
        id: 'lab-1',
        roomType: 'laboratory',
        zone: 'science',
        accessLevel: 3,
      },
    })

    expect(result.semantic).toBe('secure')
    expect(result.connectorKind).toBe('door')
    expect(result.access).toMatchObject({
      requiredLevel: 3,
      lockLevel: 3,
      lockedByDefault: true,
      pressureBoundary: false,
      checkpoint: true,
    })
    expect(result.access.reasons).toEqual([
      'secure-access-level',
      'access-transition',
    ])
  })

  it('recognizes secure room types even when legacy access data is low', () => {
    const result = classify({
      neighbor: {
        id: 'bridge-1',
        roomType: 'Bridge',
        zone: 'command',
        accessLevel: 1,
      },
    })

    expect(result.semantic).toBe('secure')
    expect(result.access.requiredLevel).toBe(2)
    expect(result.access.reasons).toEqual(['secure-room'])
  })

  it('uses a bulkhead at a residential-to-engineering containment boundary', () => {
    const result = classify({
      neighbor: {
        id: 'maintenance-1',
        roomType: 'maintenance',
        zone: 'engineering',
        accessLevel: 1,
      },
    })

    expect(result.semantic).toBe('bulkhead')
    expect(result.connectorKind).toBe('bulkhead')
    expect(result.access).toMatchObject({
      lockLevel: 1,
      failsafe: false,
      pressureBoundary: true,
      interlocked: false,
      checkpoint: false,
    })
    expect(result.access.reasons).toEqual([
      'containment-zone-boundary',
      'containment-room',
    ])
  })

  it('uses an internal bulkhead rather than an airlock near an exterior room', () => {
    const result = classify({
      room: {
        id: 'hangar-1',
        roomType: 'hangar',
        zone: 'docking',
        accessLevel: 1,
        isExterior: true,
      },
      exteriorProximity: 'near-hull',
    })

    expect(result.semantic).toBe('bulkhead')
    expect(result.access.reasons).toEqual([
      'containment-zone-boundary',
      'containment-room',
      'exterior-room-boundary',
    ])
  })

  it('is deterministic and symmetric when room endpoints are swapped', () => {
    const room: DoorRoomContext = {
      id: 'crew-1',
      roomType: 'crewQuarters',
      zone: 'residential',
      accessLevel: 1,
    }
    const neighbor: DoorRoomContext = {
      id: 'engineering-1',
      roomType: 'engineering',
      zone: 'engineering',
      accessLevel: 2,
      tags: ['Pressure', 'Engineering'],
    }
    const first = classifyDoor({
      connectionId: 'stable-connector',
      room,
      neighbor,
      exteriorProximity: 'interior',
    })
    const second = classifyDoor({
      connectionId: 'stable-connector',
      room: neighbor,
      neighbor: room,
      exteriorProximity: 'interior',
    })

    expect(first).toEqual(second)
    expect(first.access.accessId).toBe('stable-connector:door-access:v1')
  })

  it('clamps malformed legacy access levels into the stable 0..3 contract', () => {
    const result = classify({
      room: {
        ...CREW_ROOM,
        accessLevel: Number.POSITIVE_INFINITY,
      },
      neighbor: {
        id: 'public-1',
        roomType: 'lobby',
        zone: 'public',
        accessLevel: -5,
      },
    })

    expect(result.access.requiredLevel).toBe(0)
    expect(result.access.requiredAccess).toBe('public')
  })
})
