import type {
  Corridor,
  CorridorAttachment,
  CorridorEndpointAnchor,
  CorridorSegment,
  Point,
  Rect,
  Room,
} from './types'
import { getAttachmentPosition } from './corridorPathfinding'

export interface RoomMoveDelta {
  x: number
  y: number
}

export type CorridorReconcileStatus = 'unchanged' | 'rerouted' | 'blocked'

export interface ReconcileAttachedCorridorInput {
  corridor: Corridor
  rooms: readonly Room[]
  changedRoomIds: ReadonlySet<string> | readonly string[]
  gridSize: number
  clearance?: number
}

export interface ReconcileAttachedCorridorResult {
  status: CorridorReconcileStatus
  corridor: Corridor
  warnings: string[]
}

interface ExpandedObstacle {
  roomId: string
  left: number
  right: number
  top: number
  bottom: number
}

type Direction = 'H' | 'V' | null

interface RouteState {
  nodeIndex: number
  direction: Direction
  cost: number
  estimate: number
  previousKey: string | null
}

/**
 * Move a room and all of its absolute-position contents by one delta.
 *
 * The editor currently stores doors and room objects in world coordinates, so
 * moving only `bounds` leaves those contents behind. This helper deliberately
 * returns a new room and does not mutate any nested input objects.
 */
export function moveRoomWithContents(room: Room, delta: RoomMoveDelta): Room {
  return {
    ...room,
    bounds: {
      ...room.bounds,
      x: room.bounds.x + delta.x,
      y: room.bounds.y + delta.y,
    },
    doors: room.doors.map(door => ({
      ...door,
      position: translatePoint(door.position, delta),
    })),
    objects: room.objects.map(object => ({
      ...object,
      position: translatePoint(object.position, delta),
    })),
  }
}

/**
 * Remove room-bound endpoint references without changing corridor geometry.
 * Canonical room-port anchors become explicit free endpoints at the last valid
 * segment position; unrelated endpoints are preserved.
 */
export function detachCorridorFromRoom(corridor: Corridor, roomId: string): Corridor {
  const firstSegment = corridor.segments[0]
  const lastSegment = corridor.segments[corridor.segments.length - 1]
  const detachStart =
    corridor.startAttachment?.roomId === roomId ||
    (corridor.startAnchor?.kind === 'roomPort' && corridor.startAnchor.roomId === roomId)
  const detachEnd =
    corridor.endAttachment?.roomId === roomId ||
    (corridor.endAnchor?.kind === 'roomPort' && corridor.endAnchor.roomId === roomId)
  if (!detachStart && !detachEnd) return corridor

  return {
    ...corridor,
    startAttachment: detachStart ? undefined : corridor.startAttachment,
    endAttachment: detachEnd ? undefined : corridor.endAttachment,
    startAnchor: detachStart && firstSegment
      ? { kind: 'free', position: { ...firstSegment.start } }
      : corridor.startAnchor,
    endAnchor: detachEnd && lastSegment
      ? { kind: 'free', position: { ...lastSegment.end } }
      : corridor.endAnchor,
  }
}

/**
 * Rebuild a legacy corridor when one of its attached rooms moved or resized.
 *
 * Endpoint wall anchors are resolved against the supplied (updated) rooms.
 * Attached endpoints always receive a straight outward stub before the
 * obstacle-aware orthogonal route begins. Endpoint rooms are excluded from the
 * obstacle set; every other room is inflated by corridor width and clearance.
 */
export function reconcileAttachedCorridor(
  input: ReconcileAttachedCorridorInput
): ReconcileAttachedCorridorResult {
  const { corridor, rooms } = input
  const changedRoomIds = input.changedRoomIds instanceof Set
    ? input.changedRoomIds
    : new Set(input.changedRoomIds)

  const affected =
    (corridor.startAttachment && changedRoomIds.has(corridor.startAttachment.roomId)) ||
    (corridor.endAttachment && changedRoomIds.has(corridor.endAttachment.roomId)) ||
    (corridor.startAnchor?.kind === 'roomPort' && changedRoomIds.has(corridor.startAnchor.roomId)) ||
    (corridor.endAnchor?.kind === 'roomPort' && changedRoomIds.has(corridor.endAnchor.roomId))

  if (!affected) {
    return { status: 'unchanged', corridor, warnings: [] }
  }

  const firstSegment = corridor.segments[0]
  const lastSegment = corridor.segments[corridor.segments.length - 1]
  if (!firstSegment || !lastSegment) {
    return blocked(corridor, 'Cannot reconcile a corridor without segments')
  }

  const mutableRooms = rooms as Room[]
  const start = resolveEndpoint(
    corridor.startAttachment,
    corridor.startAnchor,
    firstSegment.start,
    mutableRooms,
    input.gridSize,
    corridor.width
  )
  const end = resolveEndpoint(
    corridor.endAttachment,
    corridor.endAnchor,
    lastSegment.end,
    mutableRooms,
    input.gridSize,
    corridor.width
  )

  if (!start || !end) {
    return blocked(corridor, 'An attached room no longer exists')
  }

  const endpointRoomIds = new Set(
    [
      corridor.startAttachment?.roomId,
      corridor.endAttachment?.roomId,
      corridor.startAnchor?.kind === 'roomPort'
        ? corridor.startAnchor.roomId
        : undefined,
      corridor.endAnchor?.kind === 'roomPort'
        ? corridor.endAnchor.roomId
        : undefined,
    ]
      .filter((roomId): roomId is string => Boolean(roomId))
  )
  const clearance = Math.max(0, input.clearance ?? Math.max(2, input.gridSize * 0.125))
  const padding = Math.max(0, corridor.width / 2) + clearance
  const obstacles = rooms
    .filter(room => !endpointRoomIds.has(room.id))
    .map(room => expandRoom(room, padding))

  if (
    segmentBlocked(start.anchor, start.stub, obstacles) ||
    segmentBlocked(end.stub, end.anchor, obstacles)
  ) {
    return blocked(corridor, 'A mandatory endpoint stub is blocked by another room')
  }

  const middlePath = routeOrthogonally(start.stub, end.stub, obstacles, input.gridSize)
  if (!middlePath) {
    return blocked(corridor, 'No obstacle-free orthogonal route was found')
  }

  const points = compactCollinearPoints([
    start.anchor,
    start.stub,
    ...middlePath.slice(1, -1),
    end.stub,
    end.anchor,
  ])
  const segments = pointsToSegments(points)

  if (
    segments.length === 0 ||
    !segmentsAreOrthogonalAndContinuous(segments) ||
    segments.some(segment => segmentBlocked(segment.start, segment.end, obstacles))
  ) {
    return blocked(corridor, 'The rebuilt route failed geometry validation')
  }

  const startAnchor = updateRoomPortAnchorPosition(corridor.startAnchor, start.anchor)
  const endAnchor = updateRoomPortAnchorPosition(corridor.endAnchor, end.anchor)
  const anchorsChanged =
    startAnchor !== corridor.startAnchor ||
    endAnchor !== corridor.endAnchor

  if (segmentsEqual(corridor.segments, segments) && !anchorsChanged) {
    return { status: 'unchanged', corridor, warnings: [] }
  }

  return {
    status: 'rerouted',
    corridor: {
      ...corridor,
      segments,
      startAnchor,
      endAnchor,
    },
    warnings: [],
  }
}

function updateRoomPortAnchorPosition(
  anchor: Corridor['startAnchor'],
  position: Point
): Corridor['startAnchor'] {
  if (anchor?.kind !== 'roomPort' || samePoint(anchor.position, position)) return anchor
  return { ...anchor, position: { ...position } }
}

function translatePoint(point: Point, delta: RoomMoveDelta): Point {
  return { x: point.x + delta.x, y: point.y + delta.y }
}

function resolveEndpoint(
  attachment: CorridorAttachment | undefined,
  endpointAnchor: CorridorEndpointAnchor | undefined,
  fallback: Point,
  rooms: Room[],
  gridSize: number,
  corridorWidth: number
): { anchor: Point; stub: Point } | null {
  let anchor: Point
  let wall: CorridorAttachment['wall'] | null = null

  // Legacy attachments remain authoritative during the migration.
  if (attachment) {
    const resolved = getAttachmentPosition(attachment, rooms)
    if (!resolved) return null
    anchor = resolved
    wall = attachment.wall
  } else if (endpointAnchor?.kind === 'roomPort') {
    const room = rooms.find(candidate => candidate.id === endpointAnchor.roomId)
    if (!room) return null
    const doorId = endpointAnchor.doorId ?? `door-${endpointAnchor.portId}`
    const door = room.doors.find(candidate => candidate.id === doorId)
    if (!door) return null
    anchor = { ...door.position }
    wall = nearestRoomWall(anchor, room.bounds)
  } else if (endpointAnchor) {
    anchor = { ...endpointAnchor.position }
  } else {
    anchor = { ...fallback }
  }

  if (!wall) return { anchor, stub: { ...anchor } }

  const stubLength = Math.max(gridSize, corridorWidth / 2 + Math.max(2, gridSize * 0.125))
  const vector = outwardVectorForWall(wall)
  return {
    anchor,
    stub: {
      x: anchor.x + vector.x * stubLength,
      y: anchor.y + vector.y * stubLength,
    },
  }
}

function outwardVector(attachment: CorridorAttachment): Point {
  return outwardVectorForWall(attachment.wall)
}

function outwardVectorForWall(wall: CorridorAttachment['wall']): Point {
  switch (wall) {
    case 'top': return { x: 0, y: -1 }
    case 'right': return { x: 1, y: 0 }
    case 'bottom': return { x: 0, y: 1 }
    case 'left': return { x: -1, y: 0 }
  }
}

function nearestRoomWall(
  point: Point,
  bounds: Rect
): CorridorAttachment['wall'] {
  const distances: Array<{
    wall: CorridorAttachment['wall']
    distance: number
  }> = [
    { wall: 'top', distance: Math.abs(point.y - bounds.y) },
    { wall: 'right', distance: Math.abs(point.x - (bounds.x + bounds.width)) },
    { wall: 'bottom', distance: Math.abs(point.y - (bounds.y + bounds.height)) },
    { wall: 'left', distance: Math.abs(point.x - bounds.x) },
  ]
  distances.sort((a, b) => a.distance - b.distance)
  return distances[0].wall
}

function expandRoom(room: Room, padding: number): ExpandedObstacle {
  return {
    roomId: room.id,
    left: room.bounds.x - padding,
    right: room.bounds.x + room.bounds.width + padding,
    top: room.bounds.y - padding,
    bottom: room.bounds.y + room.bounds.height + padding,
  }
}

/**
 * Deterministic sparse orthogonal routing over endpoint and obstacle-border
 * coordinates. The small offset keeps candidate tracks strictly outside the
 * inflated obstacle rectangles.
 */
function routeOrthogonally(
  start: Point,
  end: Point,
  obstacles: ExpandedObstacle[],
  gridSize: number
): Point[] | null {
  if (samePoint(start, end)) return [{ ...start }, { ...end }]
  if (pointBlocked(start, obstacles) || pointBlocked(end, obstacles)) return null

  const margin = Math.max(1, gridSize * 0.05)
  const xs = uniqueSorted([
    start.x,
    end.x,
    ...obstacles.flatMap(obstacle => [obstacle.left - margin, obstacle.right + margin]),
  ])
  const ys = uniqueSorted([
    start.y,
    end.y,
    ...obstacles.flatMap(obstacle => [obstacle.top - margin, obstacle.bottom + margin]),
  ])

  const nodes: Point[] = []
  const nodeByCoordinate = new Map<string, number>()
  for (const y of ys) {
    for (const x of xs) {
      const point = { x, y }
      if (pointBlocked(point, obstacles)) continue
      nodeByCoordinate.set(pointKey(point), nodes.length)
      nodes.push(point)
    }
  }

  const startIndex = nodeByCoordinate.get(pointKey(start))
  const endIndex = nodeByCoordinate.get(pointKey(end))
  if (startIndex === undefined || endIndex === undefined) return null

  const neighbors = buildSparseNeighbors(nodes, xs, ys, nodeByCoordinate, obstacles)
  const open: RouteState[] = [{
    nodeIndex: startIndex,
    direction: null,
    cost: 0,
    estimate: manhattan(nodes[startIndex], nodes[endIndex]),
    previousKey: null,
  }]
  const best = new Map<string, number>([[stateKey(startIndex, null), 0]])
  const visited = new Set<string>()
  const states = new Map<string, RouteState>()
  states.set(stateKey(startIndex, null), open[0])
  const bendPenalty = Math.max(1, gridSize * 0.5)

  let finalKey: string | null = null
  while (open.length > 0) {
    open.sort((a, b) =>
      (a.cost + a.estimate) - (b.cost + b.estimate) ||
      a.cost - b.cost ||
      a.nodeIndex - b.nodeIndex ||
      directionRank(a.direction) - directionRank(b.direction)
    )
    const current = open.shift()!
    const currentKey = stateKey(current.nodeIndex, current.direction)
    if (visited.has(currentKey)) continue
    visited.add(currentKey)

    if (current.nodeIndex === endIndex) {
      finalKey = currentKey
      break
    }

    for (const nextIndex of neighbors[current.nodeIndex]) {
      const nextDirection = segmentDirection(nodes[current.nodeIndex], nodes[nextIndex])
      const turnCost =
        current.direction && current.direction !== nextDirection ? bendPenalty : 0
      const nextCost =
        current.cost + manhattan(nodes[current.nodeIndex], nodes[nextIndex]) + turnCost
      const nextKey = stateKey(nextIndex, nextDirection)
      if (nextCost >= (best.get(nextKey) ?? Infinity)) continue

      const nextState: RouteState = {
        nodeIndex: nextIndex,
        direction: nextDirection,
        cost: nextCost,
        estimate: manhattan(nodes[nextIndex], nodes[endIndex]),
        previousKey: currentKey,
      }
      best.set(nextKey, nextCost)
      states.set(nextKey, nextState)
      open.push(nextState)
    }
  }

  if (!finalKey) return null

  const reversed: Point[] = []
  let currentKey: string | null = finalKey
  while (currentKey) {
    const state = states.get(currentKey)
    if (!state) return null
    reversed.push(nodes[state.nodeIndex])
    currentKey = state.previousKey
  }

  return compactCollinearPoints(reversed.reverse())
}

function buildSparseNeighbors(
  nodes: Point[],
  xs: number[],
  ys: number[],
  nodeByCoordinate: Map<string, number>,
  obstacles: ExpandedObstacle[]
): number[][] {
  const neighbors = Array.from({ length: nodes.length }, () => [] as number[])

  for (const y of ys) {
    let previous: number | undefined
    for (const x of xs) {
      const current = nodeByCoordinate.get(pointKey({ x, y }))
      if (current === undefined) continue
      if (
        previous !== undefined &&
        !segmentBlocked(nodes[previous], nodes[current], obstacles)
      ) {
        neighbors[previous].push(current)
        neighbors[current].push(previous)
      }
      previous = current
    }
  }

  for (const x of xs) {
    let previous: number | undefined
    for (const y of ys) {
      const current = nodeByCoordinate.get(pointKey({ x, y }))
      if (current === undefined) continue
      if (
        previous !== undefined &&
        !segmentBlocked(nodes[previous], nodes[current], obstacles)
      ) {
        neighbors[previous].push(current)
        neighbors[current].push(previous)
      }
      previous = current
    }
  }

  for (const list of neighbors) {
    list.sort((a, b) => a - b)
  }
  return neighbors
}

function pointBlocked(point: Point, obstacles: ExpandedObstacle[]): boolean {
  return obstacles.some(obstacle =>
    point.x >= obstacle.left &&
    point.x <= obstacle.right &&
    point.y >= obstacle.top &&
    point.y <= obstacle.bottom
  )
}

function segmentBlocked(
  start: Point,
  end: Point,
  obstacles: ExpandedObstacle[]
): boolean {
  if (start.x !== end.x && start.y !== end.y) return true

  return obstacles.some(obstacle => {
    if (start.y === end.y) {
      const minX = Math.min(start.x, end.x)
      const maxX = Math.max(start.x, end.x)
      return (
        start.y >= obstacle.top &&
        start.y <= obstacle.bottom &&
        maxX >= obstacle.left &&
        minX <= obstacle.right
      )
    }

    const minY = Math.min(start.y, end.y)
    const maxY = Math.max(start.y, end.y)
    return (
      start.x >= obstacle.left &&
      start.x <= obstacle.right &&
      maxY >= obstacle.top &&
      minY <= obstacle.bottom
    )
  })
}

function pointsToSegments(points: Point[]): CorridorSegment[] {
  const segments: CorridorSegment[] = []
  for (let index = 0; index < points.length - 1; index++) {
    if (samePoint(points[index], points[index + 1])) continue
    segments.push({
      start: { ...points[index] },
      end: { ...points[index + 1] },
    })
  }
  return segments
}

function compactCollinearPoints(points: Point[]): Point[] {
  const compact: Point[] = []
  for (const point of points) {
    const last = compact[compact.length - 1]
    if (last && samePoint(last, point)) continue
    compact.push({ ...point })
    while (compact.length >= 3) {
      const a = compact[compact.length - 3]
      const b = compact[compact.length - 2]
      const c = compact[compact.length - 1]
      const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)
      if (!collinear) break
      compact.splice(compact.length - 2, 1)
    }
  }
  return compact
}

function segmentsAreOrthogonalAndContinuous(segments: CorridorSegment[]): boolean {
  return segments.every((segment, index) => {
    const orthogonal =
      segment.start.x === segment.end.x || segment.start.y === segment.end.y
    const previous = segments[index - 1]
    return orthogonal && (!previous || samePoint(previous.end, segment.start))
  })
}

function segmentsEqual(a: CorridorSegment[], b: CorridorSegment[]): boolean {
  return a.length === b.length && a.every((segment, index) =>
    samePoint(segment.start, b[index].start) &&
    samePoint(segment.end, b[index].end)
  )
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function stateKey(nodeIndex: number, direction: Direction): string {
  return `${nodeIndex}:${direction ?? 'N'}`
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function segmentDirection(start: Point, end: Point): Exclude<Direction, null> {
  return start.y === end.y ? 'H' : 'V'
}

function directionRank(direction: Direction): number {
  if (direction === null) return 0
  return direction === 'H' ? 1 : 2
}

function blocked(corridor: Corridor, warning: string): ReconcileAttachedCorridorResult {
  return {
    status: 'blocked',
    corridor,
    warnings: [warning],
  }
}
