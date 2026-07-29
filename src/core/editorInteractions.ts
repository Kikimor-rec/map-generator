import type {
  Corridor,
  CorridorAttachment,
  CorridorEndpointAnchor,
  CorridorJunction,
  CorridorSegment,
  Point,
  Room,
} from './types'

export type EndpointSnapKind = 'roomPort' | 'roomWall' | 'junction' | 'corridorPoint'

export interface EndpointSnapCandidate {
  kind: EndpointSnapKind
  id: string
  label: string
  position: Point
  anchor?: CorridorEndpointAnchor
  attachment?: CorridorAttachment
  distance: number
}

export interface FindEndpointSnapCandidateInput {
  point: Point
  rooms: readonly Room[]
  junctions: readonly CorridorJunction[]
  corridors: readonly Corridor[]
  excludeCorridorId?: string
  threshold?: number
}

export interface UpdateCorridorPointInput {
  corridor: Corridor
  segmentIndex: number
  pointType: 'start' | 'end'
  position: Point
  endpointBinding?: EndpointSnapCandidate | null
}

export function shouldPreserveAttachments(
  persistedPreference: boolean,
  altKey: boolean
): boolean {
  return persistedPreference !== altKey
}

/**
 * Find a deterministic endpoint target. Exact doors/ports win ties, followed
 * by explicit junctions, corridor vertices and finally legacy room walls.
 */
export function findEndpointSnapCandidate(
  input: FindEndpointSnapCandidateInput
): EndpointSnapCandidate | null {
  const threshold = Math.max(0, input.threshold ?? 24)
  const candidates: Array<EndpointSnapCandidate & { priority: number }> = []

  for (const room of input.rooms) {
    for (const door of room.doors) {
      const distance = pointDistance(input.point, door.position)
      if (distance > threshold) continue
      const attachment = attachmentForRoomPoint(room, door.position)
      const portId = door.id.startsWith('door-') ? door.id.slice(5) : door.id
      candidates.push({
        kind: 'roomPort',
        id: `${room.id}:${door.id}`,
        label: `${room.name}: door`,
        position: { ...door.position },
        attachment,
        anchor: {
          kind: 'roomPort',
          roomId: room.id,
          portId,
          doorId: door.id,
          position: { ...door.position },
        },
        distance,
        priority: 0,
      })
    }
  }

  for (const junction of input.junctions) {
    const distance = pointDistance(input.point, junction.position)
    if (distance > threshold) continue
    candidates.push({
      kind: 'junction',
      id: junction.id,
      label: `Junction ${junction.kind}`,
      position: { ...junction.position },
      anchor: {
        kind: 'junction',
        junctionId: junction.id,
        position: { ...junction.position },
      },
      distance,
      priority: 1,
    })
  }

  for (const corridor of input.corridors) {
    if (corridor.id === input.excludeCorridorId) continue
    corridor.segments.forEach((segment, segmentIndex) => {
      const segmentId = corridor.segmentIds?.[segmentIndex] ?? String(segmentIndex)
      const points: Array<{ point: Point; pointType: 'start' | 'end' }> = [
        { point: segment.start, pointType: 'start' },
        { point: segment.end, pointType: 'end' },
      ]
      for (const { point, pointType } of points) {
        const distance = pointDistance(input.point, point)
        if (distance > threshold) continue
        const pointId = `${corridor.id}:${segmentId}:${pointType}`
        candidates.push({
          kind: 'corridorPoint',
          id: pointId,
          label: 'Corridor point',
          position: { ...point },
          anchor: {
            kind: 'corridorPoint',
            pointId,
            position: { ...point },
          },
          distance,
          priority: 2,
        })
      }
    })
  }

  for (const room of input.rooms) {
    const wallTarget = projectPointToRoomWall(input.point, room)
    if (!wallTarget || wallTarget.distance > threshold) continue
    candidates.push({
      kind: 'roomWall',
      id: `${room.id}:${wallTarget.attachment.wall}:${wallTarget.attachment.offset}`,
      label: `${room.name}: wall`,
      position: wallTarget.position,
      attachment: wallTarget.attachment,
      distance: wallTarget.distance,
      priority: 3,
    })
  }

  candidates.sort((left, right) =>
    left.priority - right.priority ||
    left.distance - right.distance ||
    left.id.localeCompare(right.id)
  )

  const candidate = candidates[0]
  if (!candidate) return null
  const { priority: _priority, ...result } = candidate
  return result
}

/**
 * Update a serialized corridor point and materialize every required bend.
 * The returned document never relies on renderer-only diagonal repair.
 *
 * endpointBinding:
 * - undefined: keep endpoint attachment fields (internal waypoint edit)
 * - null: detach a true route endpoint and make it explicit `free`
 * - candidate: bind a true route endpoint to that candidate
 */
export function updateCorridorPoint(input: UpdateCorridorPointInput): Corridor {
  const { corridor, segmentIndex, pointType, position } = input
  if (segmentIndex < 0 || segmentIndex >= corridor.segments.length) return corridor
  if (corridor.segments.length === 0) return corridor

  const originalPoints = corridorToPoints(corridor.segments)
  const pointIndex = pointType === 'start' ? segmentIndex : segmentIndex + 1
  if (!originalPoints[pointIndex]) return corridor

  const updatedPoints = originalPoints.map(point => ({ ...point }))
  updatedPoints[pointIndex] = { ...position }
  const segments = rebuildOrthogonalSegments(updatedPoints, corridor.segments)
  if (segments.length === 0) return corridor

  const isStartEndpoint = pointIndex === 0
  const isEndEndpoint = pointIndex === originalPoints.length - 1
  let updated: Corridor = {
    ...corridor,
    segments,
    segmentIds:
      segments.length === corridor.segments.length ? corridor.segmentIds : undefined,
  }

  if (input.endpointBinding === undefined || (!isStartEndpoint && !isEndEndpoint)) {
    return updated
  }

  const endpointPosition = isStartEndpoint
    ? segments[0].start
    : segments[segments.length - 1].end
  const binding = input.endpointBinding
  const anchor = binding
    ? binding.anchor
    : {
        kind: 'free' as const,
        position: { ...endpointPosition },
      }
  const attachment = binding?.attachment

  if (isStartEndpoint) {
    updated = {
      ...updated,
      startAttachment: attachment,
      startAnchor: anchor,
    }
  } else {
    updated = {
      ...updated,
      endAttachment: attachment,
      endAnchor: anchor,
    }
  }

  return updated
}

export function corridorIsOrthogonalAndContinuous(corridor: Corridor): boolean {
  return corridor.segments.every((segment, index) => {
    const orthogonal =
      segment.start.x === segment.end.x || segment.start.y === segment.end.y
    const previous = corridor.segments[index - 1]
    return orthogonal && (!previous || samePoint(previous.end, segment.start))
  })
}

function corridorToPoints(segments: readonly CorridorSegment[]): Point[] {
  const points: Point[] = [{ ...segments[0].start }]
  for (const segment of segments) {
    const previous = points[points.length - 1]
    if (!samePoint(previous, segment.start)) {
      points.push({ ...segment.start })
    }
    points.push({ ...segment.end })
  }
  return compactPoints(points)
}

function rebuildOrthogonalSegments(
  points: readonly Point[],
  originalSegments: readonly CorridorSegment[]
): CorridorSegment[] {
  const rebuiltPoints: Point[] = []
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]
    const end = points[index + 1]
    appendPoint(rebuiltPoints, start)
    if (start.x !== end.x && start.y !== end.y) {
      const original = originalSegments[Math.min(index, originalSegments.length - 1)]
      const horizontalFirst = original
        ? original.start.y === original.end.y
        : true
      appendPoint(rebuiltPoints, horizontalFirst
        ? { x: end.x, y: start.y }
        : { x: start.x, y: end.y })
    }
    appendPoint(rebuiltPoints, end)
  }

  const compact = compactPoints(rebuiltPoints)
  const segments: CorridorSegment[] = []
  for (let index = 0; index < compact.length - 1; index++) {
    if (samePoint(compact[index], compact[index + 1])) continue
    segments.push({
      start: { ...compact[index] },
      end: { ...compact[index + 1] },
    })
  }
  return segments
}

function compactPoints(points: readonly Point[]): Point[] {
  const compact: Point[] = []
  for (const point of points) {
    appendPoint(compact, point)
    while (compact.length >= 3) {
      const a = compact[compact.length - 3]
      const b = compact[compact.length - 2]
      const c = compact[compact.length - 1]
      const collinear =
        (a.x === b.x && b.x === c.x) ||
        (a.y === b.y && b.y === c.y)
      if (!collinear) break
      compact.splice(compact.length - 2, 1)
    }
  }
  return compact
}

function appendPoint(points: Point[], point: Point): void {
  const previous = points[points.length - 1]
  if (!previous || !samePoint(previous, point)) {
    points.push({ ...point })
  }
}

function attachmentForRoomPoint(room: Room, point: Point): CorridorAttachment {
  const candidates: Array<{
    wall: CorridorAttachment['wall']
    distance: number
    offset: number
  }> = [
    {
      wall: 'top',
      distance: Math.abs(point.y - room.bounds.y),
      offset: (point.x - room.bounds.x) / room.bounds.width,
    },
    {
      wall: 'right',
      distance: Math.abs(point.x - (room.bounds.x + room.bounds.width)),
      offset: (point.y - room.bounds.y) / room.bounds.height,
    },
    {
      wall: 'bottom',
      distance: Math.abs(point.y - (room.bounds.y + room.bounds.height)),
      offset: (point.x - room.bounds.x) / room.bounds.width,
    },
    {
      wall: 'left',
      distance: Math.abs(point.x - room.bounds.x),
      offset: (point.y - room.bounds.y) / room.bounds.height,
    },
  ]
  candidates.sort((left, right) => left.distance - right.distance)
  return {
    roomId: room.id,
    wall: candidates[0].wall,
    offset: clamp01(candidates[0].offset),
  }
}

function projectPointToRoomWall(
  point: Point,
  room: Room
): { position: Point; attachment: CorridorAttachment; distance: number } | null {
  const { x, y, width, height } = room.bounds
  const projections: Array<{
    position: Point
    attachment: CorridorAttachment
    distance: number
  }> = [
    wallProjection(point, room, 'top', { x: clamp(point.x, x, x + width), y }),
    wallProjection(point, room, 'right', { x: x + width, y: clamp(point.y, y, y + height) }),
    wallProjection(point, room, 'bottom', { x: clamp(point.x, x, x + width), y: y + height }),
    wallProjection(point, room, 'left', { x, y: clamp(point.y, y, y + height) }),
  ]
  projections.sort((left, right) => left.distance - right.distance)
  return projections[0] ?? null
}

function wallProjection(
  point: Point,
  room: Room,
  wall: CorridorAttachment['wall'],
  position: Point
): { position: Point; attachment: CorridorAttachment; distance: number } {
  return {
    position,
    attachment: attachmentForRoomPoint(room, position),
    distance: pointDistance(point, position),
  }
}

function pointDistance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clamp01(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0.5, 0, 1)
}
