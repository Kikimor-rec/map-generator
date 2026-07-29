import { addConnectorIdToTile } from './corridorGraph'
import { getTile } from './canvas'
import {
  TileType,
  type GridCanvas,
  type HullLayout,
  type HullLink,
  type Point,
} from './types'

export interface CirculationRun {
  id: string
  fromModuleId: string
  toModuleId: string
  kind: HullLink['kind']
  points: Point[]
}

/**
 * Converts clustered-outpost construction links into one-tile orthogonal
 * corridor centerlines. All runs are validated before the canvas is mutated.
 */
export function carveOutpostCirculation(
  canvas: GridCanvas,
  layout: HullLayout
): CirculationRun[] {
  if (layout.kind !== 'clustered-outpost') {
    return []
  }

  const runs = layout.links.map(link => ({
    id: link.id,
    fromModuleId: link.fromModuleId,
    toModuleId: link.toModuleId,
    kind: link.kind,
    points: orthogonalizeCenterline(canvas, link),
  }))

  validateRuns(canvas, runs)

  for (const run of runs) {
    const spineLevel = run.kind === 'primary' ? 0 : 1
    for (const point of run.points) {
      const existing = getTile(canvas, point.x, point.y)!
      canvas.tiles[point.y][point.x] = addConnectorIdToTile(
        {
          ...existing,
          type: TileType.CORRIDOR,
          spineLevel: Math.min(existing.spineLevel ?? spineLevel, spineLevel),
        },
        run.id
      )
    }
  }

  return runs
}

function orthogonalizeCenterline(
  canvas: GridCanvas,
  link: HullLink
): Point[] {
  if (link.centerline.length === 0) {
    throw new Error(`Outpost link "${link.id}" has an empty centerline`)
  }

  const path: Point[] = [{ ...link.centerline[0] }]
  let current = path[0]

  for (const target of link.centerline.slice(1)) {
    while (current.x !== target.x || current.y !== target.y) {
      const dx = Math.sign(target.x - current.x)
      const dy = Math.sign(target.y - current.y)

      let next: Point | undefined
      if (dx !== 0 && dy !== 0) {
        const xFirst = { x: current.x + dx, y: current.y }
        const yFirst = { x: current.x, y: current.y + dy }
        next = isInsideHull(canvas, xFirst)
          ? xFirst
          : isInsideHull(canvas, yFirst)
            ? yFirst
            : undefined
      } else {
        const candidate = {
          x: current.x + dx,
          y: current.y + dy,
        }
        next = isInsideHull(canvas, candidate) ? candidate : undefined
      }

      if (!next) {
        throw new Error(
          `Outpost link "${link.id}" leaves the hull near (${current.x}, ${current.y})`
        )
      }

      const last = path[path.length - 1]
      if (last.x !== next.x || last.y !== next.y) {
        path.push(next)
      }
      current = next
    }
  }

  return path
}

function validateRuns(canvas: GridCanvas, runs: CirculationRun[]): void {
  for (const run of runs) {
    for (const point of run.points) {
      const tile = getTile(canvas, point.x, point.y)
      if (!tile || tile.type === TileType.VOID) {
        throw new Error(
          `Outpost circulation "${run.id}" crosses VOID at (${point.x}, ${point.y})`
        )
      }
      if (
        tile.type !== TileType.HULL &&
        tile.type !== TileType.CORRIDOR &&
        tile.type !== TileType.JUNCTION
      ) {
        throw new Error(
          `Outpost circulation "${run.id}" cannot overwrite tile type ${tile.type} at (${point.x}, ${point.y})`
        )
      }
    }
  }
}

function isInsideHull(canvas: GridCanvas, point: Point): boolean {
  const tile = getTile(canvas, point.x, point.y)
  return !!tile && tile.type !== TileType.VOID
}
