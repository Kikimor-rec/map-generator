import { useRef, useEffect, useCallback, useState } from 'react'
import { Application, Graphics, Container, Text, TextStyle, Rectangle, Polygon } from 'pixi.js'
import { useEditor, actions } from '@store/EditorContext'
import { DuplicateIcon, TrashIcon, BringToFrontIcon, SendToBackIcon, SelectAllIcon, RoomIcon } from '@ui/components/Icons'
import { EditorTool, CorridorStyle, DoorType, type Rect, type Point, type Room, type Door, type Corridor, type CorridorAttachment, type CorridorJunction, type CorridorLineJump, ROOM_TYPE_CONFIGS } from '@core/types'
import { snapToRoomWall, autoRouteCorridor, checkCorridorRoomCollision } from '@core/corridorPathfinding'
import {
  detachCorridorFromRoom,
  moveRoomWithContents,
  reconcileAttachedCorridor,
} from '@core/geometryEdit'
import {
  findEndpointSnapCandidate,
  shouldPreserveAttachments,
  updateCorridorPoint,
  type EndpointSnapCandidate,
} from '@core/editorInteractions'
import { beginRightMousePan, idleRightMousePan, updateRightMousePan } from './rightMousePan'
import { buildDeckGeometryRenderPaths, type RenderPolygon } from './deckGeometry'

// Helper to convert hex string to number
function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

// Helper to find nearest wall of a room to a point
function findNearestWall(point: Point, room: Room): { position: Point; rotation: number; wall: 'top' | 'right' | 'bottom' | 'left' } | null {
  const { x, y, width, height } = room.bounds
  const threshold = 30 // Max distance to wall (increased for easier placement)
  
  // First check if point is near the room (within threshold of any wall)
  const nearRoom = point.x >= x - threshold && point.x <= x + width + threshold &&
                   point.y >= y - threshold && point.y <= y + height + threshold
  
  if (!nearRoom) return null
  
  // Calculate distances to each wall (only if point is roughly aligned with that wall)
  const walls = []
  
  // Top wall - point should be near the top edge
  if (point.x >= x && point.x <= x + width) {
    walls.push({ 
      wall: 'top' as const, 
      dist: Math.abs(point.y - y), 
      rotation: 0, 
      pos: { x: point.x, y } 
    })
  }
  
  // Bottom wall
  if (point.x >= x && point.x <= x + width) {
    walls.push({ 
      wall: 'bottom' as const, 
      dist: Math.abs(point.y - (y + height)), 
      rotation: 0, 
      pos: { x: point.x, y: y + height } 
    })
  }
  
  // Left wall
  if (point.y >= y && point.y <= y + height) {
    walls.push({ 
      wall: 'left' as const, 
      dist: Math.abs(point.x - x), 
      rotation: 90, 
      pos: { x, y: point.y } 
    })
  }
  
  // Right wall
  if (point.y >= y && point.y <= y + height) {
    walls.push({ 
      wall: 'right' as const, 
      dist: Math.abs(point.x - (x + width)), 
      rotation: 90, 
      pos: { x: x + width, y: point.y } 
    })
  }
  
  if (walls.length === 0) return null
  
  // Find closest wall
  const closest = walls.reduce((a, b) => a.dist < b.dist ? a : b)
  
  if (closest.dist > threshold) return null
  
  return {
    position: closest.pos,
    rotation: closest.rotation,
    wall: closest.wall,
  }
}

// Helper to calculate distance from point to line segment
function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSq = dx * dx + dy * dy
  
  if (lengthSq === 0) {
    // Segment is a point
    return Math.sqrt((point.x - start.x) ** 2 + (point.y - start.y) ** 2)
  }
  
  // Parameter t for closest point on line
  let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  
  const closestX = start.x + t * dx
  const closestY = start.y + t * dy
  
  return Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2)
}

function samePoint(a: Point, b: Point, tolerance = 0.5): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance
}

function isCorridorAttachedToRoom(corridor: Corridor, roomId: string): boolean {
  return (
    corridor.startAttachment?.roomId === roomId ||
    corridor.endAttachment?.roomId === roomId ||
    (corridor.startAnchor?.kind === 'roomPort' && corridor.startAnchor.roomId === roomId) ||
    (corridor.endAnchor?.kind === 'roomPort' && corridor.endAnchor.roomId === roomId)
  )
}

function orthogonalizeSegment(start: Point, end: Point): Array<{ start: Point; end: Point }> {
  if (samePoint(start, end)) return []
  if (start.x === end.x || start.y === end.y) {
    return [{ start, end }]
  }

  const bend = { x: end.x, y: start.y }
  return [
    { start, end: bend },
    { start: bend, end },
  ].filter(segment => !samePoint(segment.start, segment.end))
}

function getRenderableCorridorSegments(corridor: Corridor): Array<{ start: Point; end: Point }> {
  return corridor.segments.flatMap(segment => orthogonalizeSegment(segment.start, segment.end))
}

function orthogonalizeSegments(segments: Array<{ start: Point; end: Point }>): Array<{ start: Point; end: Point }> {
  return segments.flatMap(segment => orthogonalizeSegment(segment.start, segment.end))
}

function getCorridorPathChains(corridor: Corridor): Point[][] {
  const segments = getRenderableCorridorSegments(corridor)
  if (segments.length === 0) return []

  const chains: Point[][] = []
  let current: Point[] = []

  for (const segment of segments) {
    if (current.length === 0) {
      current = [segment.start, segment.end]
      continue
    }

    const last = current[current.length - 1]
    if (samePoint(last, segment.start)) {
      if (!samePoint(last, segment.end)) {
        current.push(segment.end)
      }
      continue
    }

    if (current.length >= 2) {
      chains.push(current)
    }
    current = [segment.start, segment.end]
  }

  if (current.length >= 2) {
    chains.push(current)
  }

  return chains
}

function strokePolyline(
  graphics: Graphics,
  points: Point[],
  width: number,
  color: number,
  alpha: number,
  offset: Point = { x: 0, y: 0 }
) {
  if (points.length < 2) return

  graphics.lineStyle({
    width,
    color,
    alpha,
    join: 'round' as any,
    cap: 'round' as any,
  })
  graphics.moveTo(points[0].x + offset.x, points[0].y + offset.y)
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x + offset.x, points[i].y + offset.y)
  }
}

function drawCorridorPresentationSkin(
  graphics: Graphics,
  corridors: Corridor[],
  wallColor: number,
  floorColor: number,
  shadowColor: number
) {
  for (const corridor of corridors) {
    const width = Math.min(Math.max(corridor.width || 20, 14), 28)
    for (const points of getCorridorPathChains(corridor)) {
      strokePolyline(graphics, points, width + 12, shadowColor, 0.34, { x: 5, y: 7 })
    }
  }

  for (const corridor of corridors) {
    const width = Math.min(Math.max(corridor.width || 20, 14), 28)
    for (const points of getCorridorPathChains(corridor)) {
      strokePolyline(graphics, points, width + 8, wallColor, 0.98)
    }
  }

  for (const corridor of corridors) {
    const width = Math.min(Math.max(corridor.width || 20, 14), 28)
    for (const points of getCorridorPathChains(corridor)) {
      strokePolyline(graphics, points, width, floorColor, 0.92)
    }
  }
}

// Drag state interface
interface DragState {
  isDragging: boolean
  roomId: string | null
  startPos: Point | null
  roomSnapshot: Room | null
  attachedCorridorSnapshots: Corridor[]
  detachAttachments: boolean
}

// Corridor drag state
interface CorridorDragState {
  isDragging: boolean
  corridorId: string | null
  startPos: Point | null
  originalSegments: Array<{ start: Point; end: Point }> | null
  corridorSnapshot: Corridor | null
  preserveAttachments: boolean
}

// Corridor point edit state (for resizing corridors)
interface CorridorPointEditState {
  isEditing: boolean
  corridorId: string | null
  segmentIndex: number | null
  pointType: 'start' | 'end' | null
  startPos: Point | null
  corridorSnapshot: Corridor | null
  endpoint: 'start' | 'end' | null
  preserveAttachments: boolean
  snapCandidate: EndpointSnapCandidate | null
}


// Resize state interface
interface ResizeState {
  isResizing: boolean
  roomId: string | null
  handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null
  startPos: Point | null
  roomStartBounds: Rect | null
}

// Corridor drawing state
interface CorridorDrawState {
  isDrawing: boolean
  points: Point[]
  currentPoint: Point | null
  autoRouteMode: boolean // Whether to auto-route around rooms
  // Attachment info for start point
  startAttachment?: CorridorAttachment
  // Current point attachment (for preview)
  currentAttachment?: CorridorAttachment
}

// Corridor intersection dialog state
interface CorridorIntersectionState {
  isOpen: boolean
  pendingSegments: Array<{ start: Point; end: Point }>
  intersectionPoints: Point[]
  startAttachment?: CorridorAttachment
  endAttachment?: CorridorAttachment
}

// Context menu state
interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  targetType: 'room' | 'corridor' | 'door' | 'canvas' | 'corridor-point' | null
  targetId: string | null
  // For corridor point context menu
  segmentIndex?: number
  pointType?: 'start' | 'end'
  worldPos?: Point
}

// Marquee selection state
interface MarqueeState {
  isActive: boolean
  startPoint: Point | null
  currentPoint: Point | null
}

interface SegmentSelection {
  corridorId: string
  segmentIndex: number
}

function drawRenderPolygon(graphics: Graphics, polygon: RenderPolygon): void {
  if (polygon.outer.length < 3) return

  graphics.drawPolygon(new Polygon(polygon.outer.flatMap(point => [point.x, point.y])))
  for (const hole of polygon.holes) {
    if (hole.length < 3) continue
    graphics.beginHole()
    graphics.drawPolygon(new Polygon(hole.flatMap(point => [point.x, point.y])))
    graphics.endHole()
  }
}

function strokeRenderPolygon(graphics: Graphics, polygon: RenderPolygon): void {
  if (polygon.outer.length < 3) return

  const points = [...polygon.outer, polygon.outer[0]]
  graphics.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index++) {
    graphics.lineTo(points[index].x, points[index].y)
  }
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const gridRef = useRef<Graphics | null>(null)
  const geometryContainerRef = useRef<Container | null>(null)
  const roomsContainerRef = useRef<Container | null>(null)
  const corridorsContainerRef = useRef<Container | null>(null)
  const junctionsContainerRef = useRef<Container | null>(null)
  const previewRef = useRef<Graphics | null>(null)
  const rightMousePanRef = useRef(idleRightMousePan())
  const gestureCancelledRef = useRef(false)
  const [isReady, setIsReady] = useState(false)
  
  // Space key for temporary pan mode
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  
  // Drag & resize state
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    roomId: null,
    startPos: null,
    roomSnapshot: null,
    attachedCorridorSnapshots: [],
    detachAttachments: false,
  })
  const [resizeState, setResizeState] = useState<ResizeState>({
    isResizing: false,
    roomId: null,
    handle: null,
    startPos: null,
    roomStartBounds: null,
  })
  
  // Corridor drawing state
  const [corridorDrawState, setCorridorDrawState] = useState<CorridorDrawState>({
    isDrawing: false,
    points: [],
    currentPoint: null,
    autoRouteMode: true, // Auto-route by default
  })
  
  // Corridor intersection dialog state
  const [intersectionDialog, setIntersectionDialog] = useState<CorridorIntersectionState>({
    isOpen: false,
    pendingSegments: [],
    intersectionPoints: [],
  })
  
  // Corridor drag state
  const [corridorDragState, setCorridorDragState] = useState<CorridorDragState>({
    isDragging: false,
    corridorId: null,
    startPos: null,
    originalSegments: null,
    corridorSnapshot: null,
    preserveAttachments: true,
  })
  
  // Corridor point edit state (for resizing)
  const [corridorPointEdit, setCorridorPointEdit] = useState<CorridorPointEditState>({
    isEditing: false,
    corridorId: null,
    segmentIndex: null,
    pointType: null,
    startPos: null,
    corridorSnapshot: null,
    endpoint: null,
    preserveAttachments: true,
    snapCandidate: null,
  })
  
  // Marquee selection state
  const [marqueeState, setMarqueeState] = useState<MarqueeState>({
    isActive: false,
    startPoint: null,
    currentPoint: null,
  })
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    targetType: null,
    targetId: null,
  })
  // Segment-level selection (local UI only)
  const [selectedSegment, setSelectedSegment] = useState<SegmentSelection | null>(null)

  const { state, dispatch, activeDeck, rooms, corridors, junctions, lineJumps } = useEditor()
  const { 
    viewport, 
    activeTheme, 
    showGrid, 
    gridSize, 
    activeTool, 
    activeRoomType,
    isDrawing,
    drawStartPoint,
    drawCurrentPoint,
    selection,
    hoveredId,
    preserveAttachments,
  } = state
  const showTopologyMarkers = selection.type === 'corridor' || selection.type === 'corridor-segment'

  // Clear segment selection when switching away from corridor selection
  useEffect(() => {
    if (selection.type !== 'corridor' && selection.type !== 'corridor-segment') {
      setSelectedSegment(null)
    }
  }, [selection.type])

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    return {
      x: (screenX - viewport.x) / viewport.zoom,
      y: (screenY - viewport.y) / viewport.zoom,
    }
  }, [viewport])

  // Initialize PixiJS Application
  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false
    const container = containerRef.current

    const initApp = () => {
      try {
        console.log('Initializing PixiJS 7.x...')
        
        // PixiJS 7.x uses constructor options
        const app = new Application({
          background: 0x0a1628,
          resizeTo: container,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          preserveDrawingBuffer: true, // Required for PNG export
        })

        // Check if component was unmounted
        if (cancelled) {
          app.destroy(true, { children: true })
          return
        }

        container.appendChild(app.view as HTMLCanvasElement)
        appRef.current = app
        console.log('PixiJS initialized, canvas added')

        // Enable interactivity on stage
        app.stage.interactive = true
        app.stage.hitArea = app.screen

        // Create main container with viewport transform
        const worldContainer = new Container()
        worldContainer.name = 'world'
        worldContainer.interactive = true
        worldContainer.interactiveChildren = true
        app.stage.addChild(worldContainer)

        // Create grid graphics
        const grid = new Graphics()
        grid.name = 'grid'
        worldContainer.addChild(grid)
        gridRef.current = grid

        // Facility envelope and structural voids (above grid, below map content)
        const geometryContainer = new Container()
        geometryContainer.name = 'facility-geometry'
        worldContainer.addChild(geometryContainer)
        geometryContainerRef.current = geometryContainer

        // Create corridors container (below rooms)
        const corridorsContainer = new Container()
        corridorsContainer.name = 'corridors'
        corridorsContainer.cullable = true
        worldContainer.addChild(corridorsContainer)
        corridorsContainerRef.current = corridorsContainer

        // Create junctions/line jumps container (above corridors)
        const junctionsContainer = new Container()
        junctionsContainer.name = 'junctions'
        junctionsContainer.cullable = true
        worldContainer.addChild(junctionsContainer)
        junctionsContainerRef.current = junctionsContainer

        // Create rooms container
        const roomsContainer = new Container()
        roomsContainer.name = 'rooms'
        roomsContainer.interactive = true
        roomsContainer.interactiveChildren = true
        roomsContainer.cullable = true
        worldContainer.addChild(roomsContainer)
        roomsContainerRef.current = roomsContainer

        // Create preview graphics for drawing
        const preview = new Graphics()
        preview.name = 'preview'
        worldContainer.addChild(preview)
        previewRef.current = preview

        console.log('All containers created, setting ready')
        setIsReady(true)
      } catch (error) {
        console.error('Failed to initialize PixiJS:', error)
      }
    }

    initApp()

    return () => {
      cancelled = true
      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
      }
      setIsReady(false)
    }
  }, [])

  // Update background color when theme changes
  useEffect(() => {
    if (appRef.current && isReady) {
      appRef.current.renderer.background.color = activeTheme.backgroundColor
    }
  }, [activeTheme.backgroundColor, isReady])

  // Update viewport transform
  useEffect(() => {
    if (!appRef.current || !isReady) return
    
    const worldContainer = appRef.current.stage.getChildByName('world') as Container
    if (worldContainer) {
      worldContainer.x = viewport.x
      worldContainer.y = viewport.y
      worldContainer.scale.set(viewport.zoom)
    }
  }, [viewport, isReady])

  // Draw grid
  useEffect(() => {
    if (!gridRef.current || !appRef.current || !isReady) return

    const grid = gridRef.current
    grid.clear()

    if (!showGrid) return

    const canvasWidth = appRef.current.screen.width
    const canvasHeight = appRef.current.screen.height

    // Calculate visible area in world coordinates
    const startX = Math.floor(-viewport.x / viewport.zoom / gridSize) * gridSize - gridSize
    const startY = Math.floor(-viewport.y / viewport.zoom / gridSize) * gridSize - gridSize
    const endX = startX + (canvasWidth / viewport.zoom) + gridSize * 2
    const endY = startY + (canvasHeight / viewport.zoom) + gridSize * 2

    // Draw grid lines - PixiJS 7.x API
    grid.lineStyle(1, hexToNumber(activeTheme.gridColor), 0.5)

    // Vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
      grid.moveTo(x, startY)
      grid.lineTo(x, endY)
    }

    // Horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
      grid.moveTo(startX, y)
      grid.lineTo(endX, y)
    }

    console.log('Grid drawn', { showGrid, startX, endX, startY, endY })

  }, [showGrid, viewport, gridSize, activeTheme.gridColor, isReady])

  // Draw canonical facility envelope and structural voids.
  useEffect(() => {
    if (!geometryContainerRef.current || !isReady) return

    const container = geometryContainerRef.current
    container.removeChildren()

    const paths = buildDeckGeometryRenderPaths(activeDeck?.geometry, gridSize)
    if (paths.envelope.length === 0) return

    const graphics = new Graphics()
    const wallColor = hexToNumber(activeTheme.wallColor)
    const backgroundColor = hexToNumber(activeTheme.backgroundColor)
    const accentColor = hexToNumber(activeTheme.accentColor)

    graphics.lineStyle(0)
    graphics.beginFill(wallColor, 0.09)
    for (const polygon of paths.envelope) {
      drawRenderPolygon(graphics, polygon)
    }
    graphics.endFill()

    graphics.lineStyle(4, wallColor, 0.9)
    for (const polygon of paths.envelope) {
      strokeRenderPolygon(graphics, polygon)
    }

    for (const structuralVoid of paths.structuralVoids) {
      graphics.lineStyle(2, accentColor, 0.65)
      graphics.beginFill(backgroundColor, 0.92)
      drawRenderPolygon(graphics, structuralVoid)
      graphics.endFill()
      strokeRenderPolygon(graphics, structuralVoid)
    }

    container.addChild(graphics)
  }, [activeDeck?.geometry, activeTheme, gridSize, isReady])

  // Draw rooms
  useEffect(() => {
    if (!roomsContainerRef.current || !isReady) return

    const container = roomsContainerRef.current
    container.removeChildren()

    if (!activeDeck) return

    for (const room of rooms) {
      const roomConfig = ROOM_TYPE_CONFIGS[room.type]
      const isSelected = selection.type === 'room' && selection.ids.includes(room.id)
      const isHovered = hoveredId === room.id

      const graphics = new Graphics()

      // Draw room fill - PixiJS 7.x API
      const fillColor = hexToNumber(room.color || roomConfig.defaultColor)
      const borderColor = hexToNumber(room.borderColor || roomConfig.borderColor)
      const cornerRadius = Math.min(16, Math.max(5, Math.min(room.bounds.width, room.bounds.height) * 0.12))
      
      graphics.beginFill(0x000000, activeTheme.backgroundColor === '#ffffff' ? 0.08 : 0.34)
      graphics.drawRoundedRect(
        room.bounds.x + 5,
        room.bounds.y + 7,
        room.bounds.width,
        room.bounds.height,
        cornerRadius
      )
      graphics.endFill()

      graphics.beginFill(fillColor, activeTheme.backgroundColor === '#ffffff' ? 0.12 : 0.58)
      graphics.lineStyle(
        isSelected ? 4 : isHovered ? 3 : 2.5,
        isSelected ? 0x00ff9f : isHovered ? 0x00d4ff : borderColor
      )
      graphics.drawRoundedRect(room.bounds.x, room.bounds.y, room.bounds.width, room.bounds.height, cornerRadius)
      graphics.endFill()

      // Add selection glow effect
      if (isSelected) {
        graphics.lineStyle(6, 0x00ff9f, 0.3)
        graphics.drawRoundedRect(
          room.bounds.x - 3,
          room.bounds.y - 3,
          room.bounds.width + 6,
          room.bounds.height + 6,
          cornerRadius + 3
        )
      }
      
      // Draw doors
      for (const door of room.doors) {
        const doorGraphics = new Graphics()
        const doorWidth = door.width || gridSize
        const doorThickness = 8
        
        // Door colors based on type
        const doorColors: Record<DoorType, { fill: number; stroke: number }> = {
          [DoorType.Standard]: { fill: 0x666666, stroke: 0x888888 },
          [DoorType.Blast]: { fill: 0xcc4400, stroke: 0xff6600 },
          [DoorType.Airlock]: { fill: 0x0088cc, stroke: 0x00aaff },
          [DoorType.Emergency]: { fill: 0xcc0000, stroke: 0xff0000 },
          [DoorType.Hidden]: { fill: 0x333333, stroke: 0x444444 },
          [DoorType.Secure]: { fill: 0xcc8800, stroke: 0xffaa00 },
        }
        
        const colors = doorColors[door.type] || doorColors[DoorType.Standard]
        
        // Draw door frame
        doorGraphics.lineStyle(2, colors.stroke, 1)
        doorGraphics.beginFill(colors.fill)
        
        if (door.rotation === 0) {
          // Horizontal door (top/bottom wall)
          // Main door body
          doorGraphics.drawRoundedRect(
            door.position.x - doorWidth / 2, 
            door.position.y - doorThickness / 2, 
            doorWidth, 
            doorThickness, 
            2
          )
          
          // Door panels (sliding effect)
          doorGraphics.lineStyle(1, colors.stroke, 0.7)
          doorGraphics.moveTo(door.position.x - doorWidth / 4, door.position.y - doorThickness / 2)
          doorGraphics.lineTo(door.position.x - doorWidth / 4, door.position.y + doorThickness / 2)
          doorGraphics.moveTo(door.position.x + doorWidth / 4, door.position.y - doorThickness / 2)
          doorGraphics.lineTo(door.position.x + doorWidth / 4, door.position.y + doorThickness / 2)
        } else {
          // Vertical door (left/right wall)
          doorGraphics.drawRoundedRect(
            door.position.x - doorThickness / 2, 
            door.position.y - doorWidth / 2, 
            doorThickness, 
            doorWidth, 
            2
          )
          
          // Door panels
          doorGraphics.lineStyle(1, colors.stroke, 0.7)
          doorGraphics.moveTo(door.position.x - doorThickness / 2, door.position.y - doorWidth / 4)
          doorGraphics.lineTo(door.position.x + doorThickness / 2, door.position.y - doorWidth / 4)
          doorGraphics.moveTo(door.position.x - doorThickness / 2, door.position.y + doorWidth / 4)
          doorGraphics.lineTo(door.position.x + doorThickness / 2, door.position.y + doorWidth / 4)
        }
        doorGraphics.endFill()
        
        // Door type indicator icon
        if (door.type === DoorType.Airlock) {
          // Double circle for airlock
          doorGraphics.lineStyle(1, 0xffffff, 0.8)
          doorGraphics.drawCircle(door.position.x, door.position.y, 3)
          doorGraphics.drawCircle(door.position.x, door.position.y, 5)
        } else if (door.type === DoorType.Emergency) {
          // Exclamation mark for emergency
          doorGraphics.lineStyle(2, 0xffffff, 0.9)
          doorGraphics.moveTo(door.position.x, door.position.y - 3)
          doorGraphics.lineTo(door.position.x, door.position.y + 1)
          doorGraphics.beginFill(0xffffff)
          doorGraphics.drawCircle(door.position.x, door.position.y + 3, 1)
          doorGraphics.endFill()
        } else if (door.type === DoorType.Secure) {
          // Lock icon for secure
          doorGraphics.lineStyle(1, 0xffffff, 0.8)
          doorGraphics.drawRect(door.position.x - 2, door.position.y, 4, 3)
          doorGraphics.drawCircle(door.position.x, door.position.y - 1, 2)
        } else if (door.type === DoorType.Blast) {
          // X for blast door
          doorGraphics.lineStyle(1, 0xffffff, 0.8)
          doorGraphics.moveTo(door.position.x - 2, door.position.y - 2)
          doorGraphics.lineTo(door.position.x + 2, door.position.y + 2)
          doorGraphics.moveTo(door.position.x + 2, door.position.y - 2)
          doorGraphics.lineTo(door.position.x - 2, door.position.y + 2)
        }
        
        // Door status indicator
        if (door.isLocked) {
          doorGraphics.lineStyle(2, 0xff0000)
          doorGraphics.drawCircle(door.position.x, door.position.y, 6)
        }
        
        if (door.isOpen) {
          doorGraphics.lineStyle(2, 0x00ff00)
          doorGraphics.drawCircle(door.position.x, door.position.y, 6)
        }
        
        container.addChild(doorGraphics)
      }

      // Add room label - PixiJS 7.x API
      const textStyle = new TextStyle({
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: Math.max(10, Math.min(14, Math.floor(Math.min(room.bounds.width, room.bounds.height) / 5))),
        fill: activeTheme.textColor,
        align: 'center',
        fontWeight: '600',
        wordWrap: true,
        wordWrapWidth: Math.max(40, room.bounds.width - 16),
      })
      
      const label = new Text(room.name || roomConfig.name, textStyle)
      
      label.x = room.bounds.x + room.bounds.width / 2 - label.width / 2
      label.y = room.bounds.y + room.bounds.height / 2 - label.height / 2

      container.addChild(graphics)
      container.addChild(label)

      // Make room interactive - PixiJS 7.x API
      graphics.interactive = true
      graphics.cursor = 'pointer'
      graphics.hitArea = new Rectangle(
        room.bounds.x, 
        room.bounds.y, 
        room.bounds.width, 
        room.bounds.height
      )
      
      graphics.on('pointerover', () => dispatch(actions.setHovered(room.id)))
      graphics.on('pointerout', () => dispatch(actions.setHovered(null)))
      graphics.on('pointerdown', (e) => {
        if (e.button !== 0) return
        if (activeTool === EditorTool.Select) {
          e.stopPropagation()
          
          // Shift+click for multi-select
          const shiftKey = (e.data.originalEvent as unknown as PointerEvent)?.shiftKey
          if (shiftKey && selection.type === 'room') {
            // Toggle selection
            const newIds = selection.ids.includes(room.id)
              ? selection.ids.filter(id => id !== room.id)
              : [...selection.ids, room.id]
            dispatch(actions.select({ type: 'room', ids: newIds }))
          } else {
            dispatch(actions.select({ type: 'room', ids: [room.id] }))
          }
          console.log('Room selected:', room.id)
          
          // Start dragging (only if not multi-selecting)
          if (!shiftKey) {
            gestureCancelledRef.current = false
            const worldPos = screenToWorld(e.global.x, e.global.y)
            const altKey = Boolean((e.data.originalEvent as unknown as PointerEvent)?.altKey)
            setDragState({
              isDragging: true,
              roomId: room.id,
              startPos: worldPos,
              roomSnapshot: structuredClone(room),
              attachedCorridorSnapshots: corridors
                .filter(corridor => isCorridorAttachedToRoom(corridor, room.id))
                .map(corridor => structuredClone(corridor)),
              detachAttachments: !shouldPreserveAttachments(preserveAttachments, altKey),
            })
          }
        }
      })
      
      // Add resize handles for selected rooms
      if (isSelected) {
        const handleSize = 8
        const handles: Array<{ pos: Point; cursor: string; handle: ResizeState['handle'] }> = [
          { pos: { x: room.bounds.x, y: room.bounds.y }, cursor: 'nw-resize', handle: 'nw' },
          { pos: { x: room.bounds.x + room.bounds.width / 2, y: room.bounds.y }, cursor: 'n-resize', handle: 'n' },
          { pos: { x: room.bounds.x + room.bounds.width, y: room.bounds.y }, cursor: 'ne-resize', handle: 'ne' },
          { pos: { x: room.bounds.x + room.bounds.width, y: room.bounds.y + room.bounds.height / 2 }, cursor: 'e-resize', handle: 'e' },
          { pos: { x: room.bounds.x + room.bounds.width, y: room.bounds.y + room.bounds.height }, cursor: 'se-resize', handle: 'se' },
          { pos: { x: room.bounds.x + room.bounds.width / 2, y: room.bounds.y + room.bounds.height }, cursor: 's-resize', handle: 's' },
          { pos: { x: room.bounds.x, y: room.bounds.y + room.bounds.height }, cursor: 'sw-resize', handle: 'sw' },
          { pos: { x: room.bounds.x, y: room.bounds.y + room.bounds.height / 2 }, cursor: 'w-resize', handle: 'w' },
        ]
        
        for (const h of handles) {
          const handleGraphics = new Graphics()
          handleGraphics.beginFill(0x00ff9f)
          handleGraphics.drawRect(h.pos.x - handleSize / 2, h.pos.y - handleSize / 2, handleSize, handleSize)
          handleGraphics.endFill()
          handleGraphics.interactive = true
          handleGraphics.cursor = h.cursor
          handleGraphics.hitArea = new Rectangle(
            h.pos.x - handleSize / 2,
            h.pos.y - handleSize / 2,
            handleSize,
            handleSize
          )
          
          handleGraphics.on('pointerdown', (e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            const worldPos = screenToWorld(e.global.x, e.global.y)
            setResizeState({
              isResizing: true,
              roomId: room.id,
              handle: h.handle,
              startPos: worldPos,
              roomStartBounds: { ...room.bounds },
            })
          })
          
          container.addChild(handleGraphics)
        }
      }
    }
  }, [activeDeck, rooms, corridors, selection, hoveredId, activeTheme, activeTool, dispatch, isReady, screenToWorld, gridSize, preserveAttachments])

  // Draw corridors
  useEffect(() => {
    if (!corridorsContainerRef.current || !isReady) return

    const container = corridorsContainerRef.current
    container.removeChildren()

    if (!activeDeck || !corridors.length) return

    const presentationSkin = new Graphics()
    const wallColor = hexToNumber(activeTheme.wallColor)
    const isLightTheme = activeTheme.backgroundColor === '#ffffff'
    const floorColor = isLightTheme ? 0xfffbeb : 0x1f2937
    const shadowColor = isLightTheme ? 0xfacc15 : 0x000000
    drawCorridorPresentationSkin(presentationSkin, corridors, wallColor, floorColor, shadowColor)
    container.addChild(presentationSkin)

    for (const corridor of corridors) {
      const graphics = new Graphics()
      const isSelected =
        (selection.type === 'corridor' && selection.ids.includes(corridor.id)) ||
        (selection.type === 'corridor-segment' && selection.ids.some(id => id.startsWith(`${corridor.id}:`)))
      const highlightedSegment =
        selectedSegment && selectedSegment.corridorId === corridor.id ? selectedSegment.segmentIndex : null
      const isHovered = hoveredId === corridor.id
      
      const corridorWidth = Math.min(Math.max(corridor.width || 20, 14), 28)
      const renderableSegments = getRenderableCorridorSegments(corridor)
      
      // Build hit area from segments
      for (const segment of renderableSegments) {
        // Draw invisible thick rectangle for hit detection
        const dx = segment.end.x - segment.start.x
        const dy = segment.end.y - segment.start.y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len > 0) {
          const nx = -dy / len * (corridorWidth / 2 + 10)
          const ny = dx / len * (corridorWidth / 2 + 10)
          
          graphics.beginFill(0xffffff, 0.001) // Almost invisible
          graphics.drawPolygon([
            segment.start.x + nx, segment.start.y + ny,
            segment.start.x - nx, segment.start.y - ny,
            segment.end.x - nx, segment.end.y - ny,
            segment.end.x + nx, segment.end.y + ny,
          ])
          graphics.endFill()
        }
      }
      
      // Highlight a specific segment if chosen
      if (highlightedSegment !== null && renderableSegments[highlightedSegment]) {
        const seg = renderableSegments[highlightedSegment]
        graphics.lineStyle({
          width: corridorWidth + 6,
          color: 0x00ff9f,
          alpha: 0.8,
          join: 'round' as any,
          cap: 'round' as any,
        })
        graphics.moveTo(seg.start.x, seg.start.y)
        graphics.lineTo(seg.end.x, seg.end.y)
      }

      if (isSelected || isHovered) {
        for (const points of getCorridorPathChains(corridor)) {
          strokePolyline(
            graphics,
            points,
            corridorWidth + (isSelected ? 8 : 5),
            isSelected ? 0x00ff9f : 0x00d4ff,
            isSelected ? 0.72 : 0.48
          )
        }
      }

      // Make corridor interactive
      graphics.interactive = true
      graphics.cursor = 'pointer'
      
      // Create hit area from segments
      graphics.on('pointerover', () => dispatch(actions.setHovered(corridor.id)))
      graphics.on('pointerout', () => dispatch(actions.setHovered(null)))
      graphics.on('pointerdown', (e) => {
        if (e.button !== 0) return
        if (activeTool === EditorTool.Select) {
          e.stopPropagation()
          
          // Shift+click for multi-select, Ctrl/Cmd+click for segment selection.
          // Alt is reserved for temporary attachment-mode inversion.
          const shiftKey = (e.data.originalEvent as unknown as PointerEvent)?.shiftKey
          const altKey = (e.data.originalEvent as unknown as PointerEvent)?.altKey
          const segmentSelectKey = Boolean(
            (e.data.originalEvent as unknown as PointerEvent)?.ctrlKey ||
            (e.data.originalEvent as unknown as PointerEvent)?.metaKey
          )
          const worldPos = screenToWorld(e.global.x, e.global.y)

          // Determine nearest segment to click for highlighting
          let nearestIndex: number | null = null
          let nearestDist = Infinity
          renderableSegments.forEach((seg, idx) => {
            const dist = pointToSegmentDistance(worldPos, seg.start, seg.end)
            if (dist < nearestDist) {
              nearestDist = dist
              nearestIndex = idx
            }
          })
          const selectThreshold = Math.max((corridor.width || 20) / 2 + 12, 20)
          if (nearestIndex !== null && nearestDist <= selectThreshold) {
            setSelectedSegment({ corridorId: corridor.id, segmentIndex: nearestIndex })
          } else {
            setSelectedSegment(null)
          }

          // Ctrl/Cmd+click: select a specific segment only.
          if (segmentSelectKey && nearestIndex !== null && nearestDist <= selectThreshold) {
            const segmentId = `${corridor.id}:${nearestIndex}`
            dispatch(actions.select({ type: 'corridor-segment', ids: [segmentId] }))
            return // Don't start corridor drag when selecting segment
          }

          if (shiftKey && selection.type === 'corridor') {
            // Toggle selection
            const newIds = selection.ids.includes(corridor.id)
              ? selection.ids.filter(id => id !== corridor.id)
              : [...selection.ids, corridor.id]
            dispatch(actions.select({ type: 'corridor', ids: newIds }))
          } else {
            dispatch(actions.select({ type: 'corridor', ids: [corridor.id] }))
          }

          // Start dragging corridor (only if not multi-selecting)
          if (!shiftKey) {
            gestureCancelledRef.current = false
            setCorridorDragState({
              isDragging: true,
              corridorId: corridor.id,
              startPos: worldPos,
              originalSegments: renderableSegments.map(s => ({
                start: { ...s.start }, 
                end: { ...s.end } 
              })),
              corridorSnapshot: structuredClone(corridor),
              preserveAttachments: shouldPreserveAttachments(preserveAttachments, Boolean(altKey)),
            })
          }
        }
      })
      
      container.addChild(graphics)
      
      const shouldShowEditPoints = isSelected || isHovered
      const uniquePoints: { x: number; y: number; segmentIndex: number; pointType: 'start' | 'end' }[] = []
      
      for (let segIdx = 0; segIdx < renderableSegments.length; segIdx++) {
        const segment = renderableSegments[segIdx]
        
        // Add start point (check if not duplicate)
        const hasStartPoint = uniquePoints.some(p => 
          Math.abs(p.x - segment.start.x) < 1 && Math.abs(p.y - segment.start.y) < 1
        )
        if (!hasStartPoint) {
          uniquePoints.push({ 
            x: segment.start.x, 
            y: segment.start.y, 
              segmentIndex: segIdx, 
              pointType: 'start' 
            })
          }
          
          // Add end point (check if not duplicate)
          const hasEndPoint = uniquePoints.some(p => 
            Math.abs(p.x - segment.end.x) < 1 && Math.abs(p.y - segment.end.y) < 1
          )
          if (!hasEndPoint) {
            uniquePoints.push({ 
              x: segment.end.x, 
              y: segment.end.y, 
              segmentIndex: segIdx, 
              pointType: 'end' 
            })
          }
        }
        
      if (!shouldShowEditPoints) {
        continue
      }

      for (const pt of uniquePoints) {
        const pointGraphics = new Graphics()
        
        // Check if this point has an attachment
        const isStartPoint = pt.segmentIndex === 0 && pt.pointType === 'start'
        const isEndPoint = pt.segmentIndex === renderableSegments.length - 1 && pt.pointType === 'end'
        const hasAttachment = (isStartPoint && corridor.startAttachment) || (isEndPoint && corridor.endAttachment)
        
        // Point size based on selection/hover state
        const pointSize = isSelected ? 8 : (isHovered ? 6 : 5)
        const alpha = isSelected ? 1.0 : (isHovered ? 0.9 : 0.6)
        
        // Different color for attached points
        if (hasAttachment) {
          pointGraphics.beginFill(0xff9f00, alpha) // Orange for attached
          pointGraphics.lineStyle(isSelected ? 2 : 1, 0xffffff, alpha)
        } else {
          pointGraphics.beginFill(0x00ff9f, alpha)
          pointGraphics.lineStyle(isSelected ? 2 : 1, 0xffffff, alpha)
        }
        pointGraphics.drawCircle(pt.x, pt.y, pointSize)
        pointGraphics.endFill()
        
        // Make interactive
        pointGraphics.interactive = true
        pointGraphics.cursor = 'move'
        pointGraphics.hitArea = new Rectangle(pt.x - 12, pt.y - 12, 24, 24)
        
        // Left click - select corridor AND start dragging point
        pointGraphics.on('pointerdown', (e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          gestureCancelledRef.current = false
          // Select the corridor first for visual feedback
          dispatch(actions.select({ type: 'corridor', ids: [corridor.id] }))
          
          const worldPos = screenToWorld(e.global.x, e.global.y)
          const altKey = Boolean((e.data.originalEvent as unknown as PointerEvent)?.altKey)
          const endpoint =
            pt.segmentIndex === 0 && pt.pointType === 'start'
              ? 'start'
              : pt.segmentIndex === renderableSegments.length - 1 && pt.pointType === 'end'
                ? 'end'
                : null
          setCorridorPointEdit({
            isEditing: true,
            corridorId: corridor.id,
            segmentIndex: pt.segmentIndex,
            pointType: pt.pointType,
            startPos: worldPos,
            corridorSnapshot: structuredClone(corridor),
            endpoint,
            preserveAttachments: shouldPreserveAttachments(preserveAttachments, altKey),
            snapCandidate: null,
          })
        })
        
        container.addChild(pointGraphics)
      }
    }
    
    console.log('Corridors drawn:', corridors.length)
  }, [activeDeck, corridors, activeTheme, isReady, selection, selectedSegment, hoveredId, activeTool, dispatch, screenToWorld, preserveAttachments])

  // Draw junctions and line jumps
  useEffect(() => {
    if (!junctionsContainerRef.current || !isReady) return
    
    const container = junctionsContainerRef.current
    container.removeChildren()

    if (!showTopologyMarkers) return

    // Draw junctions (T, X, hub, etc.)
    for (const junction of junctions) {
      const graphics = new Graphics()
      const { x, y } = junction.position
      
      // Junction size based on kind
      const size = junction.kind === 'hub' ? 24 : 
                   junction.kind === 'airlockChamber' ? 20 : 12
      
      // Junction color
      const color = junction.isCheckpoint ? 0xef4444 : // Red for checkpoints
                    junction.isBulkhead ? 0xf59e0b :   // Orange for bulkheads
                    0x00ff9f                           // Green default
      
      // Draw junction marker based on kind
      if (junction.kind === 'T') {
        // T-junction: small diamond
        graphics.beginFill(color, 0.8)
        graphics.lineStyle(2, 0xffffff, 0.8)
        graphics.moveTo(x, y - size)
        graphics.lineTo(x + size, y)
        graphics.lineTo(x, y + size)
        graphics.lineTo(x - size, y)
        graphics.closePath()
        graphics.endFill()
      } else if (junction.kind === 'X') {
        // X-junction: circle with cross
        graphics.lineStyle(2, color, 0.8)
        graphics.beginFill(0x0a1628, 0.9)
        graphics.drawCircle(x, y, size)
        graphics.endFill()
        graphics.lineStyle(2, color, 1)
        graphics.moveTo(x - size * 0.5, y)
        graphics.lineTo(x + size * 0.5, y)
        graphics.moveTo(x, y - size * 0.5)
        graphics.lineTo(x, y + size * 0.5)
      } else if (junction.kind === 'hub') {
        // Hub: larger hexagon
        graphics.beginFill(color, 0.6)
        graphics.lineStyle(3, color, 1)
        const points: number[] = []
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6
          points.push(x + size * Math.cos(angle), y + size * Math.sin(angle))
        }
        graphics.drawPolygon(points)
        graphics.endFill()
      } else if (junction.kind === 'airlockChamber') {
        // Airlock: rounded rectangle
        graphics.beginFill(0x0a1628, 0.9)
        graphics.lineStyle(3, color, 1)
        graphics.drawRoundedRect(x - size, y - size * 0.6, size * 2, size * 1.2, 4)
        graphics.endFill()
        // Inner doors indication
        graphics.lineStyle(2, color, 0.8)
        graphics.moveTo(x - size * 0.3, y - size * 0.4)
        graphics.lineTo(x - size * 0.3, y + size * 0.4)
        graphics.moveTo(x + size * 0.3, y - size * 0.4)
        graphics.lineTo(x + size * 0.3, y + size * 0.4)
      }
      
      container.addChild(graphics)
    }

    // Draw line jumps (corridor crossings without connection)
    for (const jump of lineJumps) {
      const graphics = new Graphics()
      const { x, y } = jump.position
      const size = jump.size || 10
      
      if (jump.style === 'arc') {
        // Arc jump: curved bridge
        graphics.lineStyle(3, 0x00d4ff, 0.9)
        graphics.arc(x, y - size * 0.3, size, 0, Math.PI, false)
      } else if (jump.style === 'gap') {
        // Gap jump: just clear the area (handled by corridor rendering)
        // Draw small indicators at gap edges
        graphics.lineStyle(2, 0x00d4ff, 0.7)
        graphics.moveTo(x - size, y - 3)
        graphics.lineTo(x - size, y + 3)
        graphics.moveTo(x + size, y - 3)
        graphics.lineTo(x + size, y + 3)
      } else if (jump.style === 'sharp') {
        // Sharp jump: angular bridge
        graphics.lineStyle(3, 0x00d4ff, 0.9)
        graphics.moveTo(x - size, y)
        graphics.lineTo(x - size * 0.3, y - size * 0.5)
        graphics.lineTo(x + size * 0.3, y - size * 0.5)
        graphics.lineTo(x + size, y)
      }
      
      container.addChild(graphics)
    }
    
    if (junctions.length > 0 || lineJumps.length > 0) {
      console.log('Junctions/LineJumps drawn:', junctions.length, lineJumps.length)
    }
  }, [junctions, lineJumps, isReady, showTopologyMarkers])

  // Draw preview while drawing room
  useEffect(() => {
    if (!previewRef.current || !isReady) return

    const preview = previewRef.current
    preview.clear()

    // Room preview
    if (isDrawing && drawStartPoint && drawCurrentPoint) {
      const minX = Math.min(drawStartPoint.x, drawCurrentPoint.x)
      const minY = Math.min(drawStartPoint.y, drawCurrentPoint.y)
      const width = Math.abs(drawCurrentPoint.x - drawStartPoint.x)
      const height = Math.abs(drawCurrentPoint.y - drawStartPoint.y)

      if (width >= 1 && height >= 1) {
        const roomConfig = ROOM_TYPE_CONFIGS[activeRoomType]
        preview.beginFill(hexToNumber(roomConfig.defaultColor), 0.4)
        preview.lineStyle(2, 0x00d4ff)
        preview.drawRect(minX, minY, width, height)
        preview.endFill()
      }
    }
    
    // Corridor preview
    if (corridorDrawState.isDrawing && corridorDrawState.points.length > 0) {
      const corridorWidth = gridSize
      const corridorColor = 0x00d4ff
      const autoRouteColor = 0x00ff9f // Green for auto-routed paths
      const collisionColor = 0xff6b6b // Red for collision warning
      
      // Draw existing segments
      preview.lineStyle(corridorWidth, corridorColor, 0.3)
      for (let i = 0; i < corridorDrawState.points.length - 1; i++) {
        preview.moveTo(corridorDrawState.points[i].x, corridorDrawState.points[i].y)
        preview.lineTo(corridorDrawState.points[i + 1].x, corridorDrawState.points[i + 1].y)
      }
      
      // Draw preview to current mouse position with auto-routing
      if (corridorDrawState.currentPoint && corridorDrawState.points.length > 0) {
        const lastPoint = corridorDrawState.points[corridorDrawState.points.length - 1]
        
        if (corridorDrawState.autoRouteMode) {
          // Calculate auto-routed path preview
          const routeResult = autoRouteCorridor(
            lastPoint, 
            corridorDrawState.currentPoint, 
            rooms, 
            corridors, 
            gridSize, 
            corridorWidth, 
            true
          )
          
          // Draw auto-routed segments
          const segmentColor = routeResult.segments.length > 1 ? autoRouteColor : corridorColor
          preview.lineStyle(corridorWidth, segmentColor, 0.3)
          
          for (const segment of orthogonalizeSegments(routeResult.segments)) {
            preview.moveTo(segment.start.x, segment.start.y)
            preview.lineTo(segment.end.x, segment.end.y)
          }
          
          // Highlight intersection points
          if (routeResult.intersections.length > 0) {
            preview.lineStyle(0)
            for (const point of routeResult.intersections) {
              preview.beginFill(collisionColor, 0.8)
              preview.drawCircle(point.x, point.y, 8)
              preview.endFill()
              // Draw X mark
              preview.lineStyle(2, 0xffffff)
              preview.moveTo(point.x - 4, point.y - 4)
              preview.lineTo(point.x + 4, point.y + 4)
              preview.moveTo(point.x + 4, point.y - 4)
              preview.lineTo(point.x - 4, point.y + 4)
            }
          }
          
          // Draw turn points for auto-routed path
          if (routeResult.segments.length > 1) {
            preview.lineStyle(0)
            for (let i = 0; i < routeResult.segments.length - 1; i++) {
              const turnPoint = routeResult.segments[i].end
              preview.beginFill(autoRouteColor, 0.8)
              preview.drawCircle(turnPoint.x, turnPoint.y, 5)
              preview.endFill()
            }
          }
        } else {
          // Simple orthogonal preview (no auto-routing)
          preview.lineStyle(corridorWidth, corridorColor, 0.2)
          for (const segment of orthogonalizeSegment(lastPoint, corridorDrawState.currentPoint)) {
            preview.moveTo(segment.start.x, segment.start.y)
            preview.lineTo(segment.end.x, segment.end.y)
          }
        }
      }
      
      // Draw placed points
      preview.lineStyle(0)
      for (const point of corridorDrawState.points) {
        preview.beginFill(0x00ff9f)
        preview.drawCircle(point.x, point.y, 6)
        preview.endFill()
      }
      
      // Draw current point preview
      if (corridorDrawState.currentPoint) {
        preview.beginFill(0x00d4ff, 0.5)
        preview.drawCircle(corridorDrawState.currentPoint.x, corridorDrawState.currentPoint.y, 6)
        preview.endFill()
      }
    }
    
    // Marquee selection preview
    if (marqueeState.isActive && marqueeState.startPoint && marqueeState.currentPoint) {
      const minX = Math.min(marqueeState.startPoint.x, marqueeState.currentPoint.x)
      const minY = Math.min(marqueeState.startPoint.y, marqueeState.currentPoint.y)
      const width = Math.abs(marqueeState.currentPoint.x - marqueeState.startPoint.x)
      const height = Math.abs(marqueeState.currentPoint.y - marqueeState.startPoint.y)
      
      // Draw dashed selection rectangle
      preview.lineStyle(2, 0x00d4ff, 0.8)
      preview.beginFill(0x00d4ff, 0.1)
      preview.drawRect(minX, minY, width, height)
      preview.endFill()
      
      // Draw corners for visual feedback
      preview.lineStyle(0)
      preview.beginFill(0x00d4ff, 1)
      const cornerSize = 4
      preview.drawRect(minX - cornerSize / 2, minY - cornerSize / 2, cornerSize, cornerSize)
      preview.drawRect(minX + width - cornerSize / 2, minY - cornerSize / 2, cornerSize, cornerSize)
      preview.drawRect(minX - cornerSize / 2, minY + height - cornerSize / 2, cornerSize, cornerSize)
      preview.drawRect(minX + width - cornerSize / 2, minY + height - cornerSize / 2, cornerSize, cornerSize)
      preview.endFill()
    }

    if (corridorPointEdit.snapCandidate) {
      const { position } = corridorPointEdit.snapCandidate
      preview.lineStyle(3, 0x00ff9f, 1)
      preview.beginFill(0x00ff9f, 0.18)
      preview.drawCircle(position.x, position.y, 12)
      preview.endFill()
    }
  }, [isDrawing, drawStartPoint, drawCurrentPoint, activeRoomType, isReady, corridorDrawState, gridSize, rooms, corridors, marqueeState, corridorPointEdit.snapCandidate])

  // Handle mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return
    
    if (e.button === 2) {
      rightMousePanRef.current = beginRightMousePan(e.clientX, e.clientY)
      setContextMenu(previous => previous.isOpen ? { ...previous, isOpen: false } : previous)
      return
    }

    const rect = containerRef.current.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    let worldPos = screenToWorld(screenX, screenY)
    
    // Snap to grid if enabled
    if (state.snapToGrid) {
      worldPos = {
        x: Math.round(worldPos.x / gridSize) * gridSize,
        y: Math.round(worldPos.y / gridSize) * gridSize,
      }
    }

    if (activeTool === EditorTool.Room) {
      dispatch(actions.startDrawing(worldPos))
    } else if (activeTool === EditorTool.Corridor) {
      // Try to snap to room walls first
      const snapResult = snapToRoomWall(worldPos, rooms, 30)
      let finalPos = snapResult.snappedPoint
      
      // If not snapped to wall, use grid snap
      if (!snapResult.roomId && state.snapToGrid) {
        finalPos = {
          x: Math.round(worldPos.x / gridSize) * gridSize,
          y: Math.round(worldPos.y / gridSize) * gridSize,
        }
      }
      
      // Create attachment if snapped to a room
      const attachment: CorridorAttachment | undefined = snapResult.roomId && snapResult.wall 
        ? { roomId: snapResult.roomId, wall: snapResult.wall, offset: snapResult.offset }
        : undefined
      
      // Add point to corridor
      setCorridorDrawState(prev => {
        const isFirstPoint = prev.points.length === 0
        return {
          ...prev,
          isDrawing: true,
          points: [...prev.points, finalPos],
          currentPoint: finalPos,
          // Store start attachment on first point
          startAttachment: isFirstPoint ? attachment : prev.startAttachment,
          currentAttachment: attachment,
        }
      })
    } else if (activeTool === EditorTool.Door) {
      // Find nearest room wall and place door
      for (const room of rooms) {
        const wallInfo = findNearestWall(worldPos, room)
        if (wallInfo) {
          const newDoor: Door = {
            id: crypto.randomUUID(),
            type: DoorType.Standard,
            position: wallInfo.position,
            rotation: wallInfo.rotation,
            width: gridSize,
            isOpen: false,
            isLocked: false,
            securityLevel: 0,
          }
          
          dispatch(actions.updateRoom(room.id, {
            doors: [...room.doors, newDoor],
          }))
          dispatch(actions.pushHistory())
          console.log('Door placed on', wallInfo.wall, 'wall of room', room.name)
          break
        }
      }
    } else if (activeTool === EditorTool.Eraser) {
      // Check if clicking on a room
      for (const room of rooms) {
        const { x, y, width, height } = room.bounds
        if (worldPos.x >= x && worldPos.x <= x + width && worldPos.y >= y && worldPos.y <= y + height) {
          dispatch(actions.deleteRooms([room.id]))
          dispatch(actions.pushHistory())
          console.log('Room erased:', room.name)
          return
        }
      }
      
      // Check if clicking on a corridor (simplified - check if near any segment)
      for (const corridor of corridors) {
        for (const segment of corridor.segments) {
          // Check distance to line segment
          const dist = pointToSegmentDistance(worldPos, segment.start, segment.end)
          if (dist < corridor.width / 2 + 10) {
            dispatch(actions.deleteCorridors([corridor.id]))
            dispatch(actions.pushHistory())
            console.log('Corridor erased')
            return
          }
        }
      }
    } else if (activeTool === EditorTool.Select) {
      // Check if clicking on a room
      for (const room of rooms) {
        const { x, y, width, height } = room.bounds
        if (worldPos.x >= x && worldPos.x <= x + width && worldPos.y >= y && worldPos.y <= y + height) {
          // Room click - handled in room graphics interaction
          return
        }
      }
      
      // Check if clicking on a corridor
      for (const corridor of corridors) {
        for (const segment of corridor.segments) {
          const dist = pointToSegmentDistance(worldPos, segment.start, segment.end)
          if (dist < (corridor.width || 20) / 2 + 10) {
            // Corridor click - handled in corridor graphics interaction
            return
          }
        }
      }
      
      // Clicked on empty space - start marquee selection
      // Clear selection if not holding Shift
      if (!e.shiftKey) {
        dispatch(actions.clearSelection())
      }
      
      setMarqueeState({
        isActive: true,
        startPoint: worldPos,
        currentPoint: worldPos,
      })
    }
  }, [activeTool, screenToWorld, dispatch, state.snapToGrid, gridSize, rooms, corridors])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return

    const isRightMouseDown = (e.buttons & 2) === 2
    if (isRightMouseDown) {
      rightMousePanRef.current = updateRightMousePan(
        rightMousePanRef.current, e.clientX, e.clientY
      )
    }

    const rect = containerRef.current.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = screenToWorld(screenX, screenY)

    // Handle room dragging
    if (dragState.isDragging && dragState.roomId && dragState.startPos && dragState.roomSnapshot) {
      const dx = worldPos.x - dragState.startPos.x
      const dy = worldPos.y - dragState.startPos.y
      
      let newX = dragState.roomSnapshot.bounds.x + dx
      let newY = dragState.roomSnapshot.bounds.y + dy
      
      // Snap to grid if enabled
      if (state.snapToGrid) {
        newX = Math.round(newX / gridSize) * gridSize
        newY = Math.round(newY / gridSize) * gridSize
      }
      
      const movedRoom = moveRoomWithContents(dragState.roomSnapshot, {
        x: newX - dragState.roomSnapshot.bounds.x,
        y: newY - dragState.roomSnapshot.bounds.y,
      })
      dispatch(actions.updateRoom(dragState.roomId, {
        bounds: movedRoom.bounds,
        doors: movedRoom.doors,
        objects: movedRoom.objects,
      }))

      if (!dragState.detachAttachments) {
        const previewRooms = rooms.map(room =>
          room.id === movedRoom.id ? movedRoom : room
        )
        for (const snapshot of dragState.attachedCorridorSnapshots) {
          const result = reconcileAttachedCorridor({
            corridor: snapshot,
            rooms: previewRooms,
            changedRoomIds: [movedRoom.id],
            gridSize,
          })
          if (result.status === 'rerouted') {
            dispatch(actions.updateCorridor(snapshot.id, {
              segments: result.corridor.segments,
              startAnchor: result.corridor.startAnchor,
              endAnchor: result.corridor.endAnchor,
            }))
          }
        }
      }
      return
    }
    
    // Handle corridor dragging
    if (
      corridorDragState.isDragging &&
      corridorDragState.corridorId &&
      corridorDragState.startPos &&
      corridorDragState.originalSegments &&
      corridorDragState.corridorSnapshot
    ) {
      const dx = worldPos.x - corridorDragState.startPos.x
      const dy = worldPos.y - corridorDragState.startPos.y
      
      // Apply offset to all segments
      const newSegments = corridorDragState.originalSegments.map(seg => {
        let startX = seg.start.x + dx
        let startY = seg.start.y + dy
        let endX = seg.end.x + dx
        let endY = seg.end.y + dy
        
        // Snap to grid if enabled
        if (state.snapToGrid) {
          startX = Math.round(startX / gridSize) * gridSize
          startY = Math.round(startY / gridSize) * gridSize
          endX = Math.round(endX / gridSize) * gridSize
          endY = Math.round(endY / gridSize) * gridSize
        }
        
        return {
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
        }
      })
      
      const snapshot = corridorDragState.corridorSnapshot
      let updated: Corridor = {
        ...snapshot,
        segments: newSegments,
      }

      if (corridorDragState.preserveAttachments) {
        const startIsBound =
          Boolean(snapshot.startAttachment) ||
          Boolean(snapshot.startAnchor && snapshot.startAnchor.kind !== 'free')
        const endIsBound =
          Boolean(snapshot.endAttachment) ||
          Boolean(snapshot.endAnchor && snapshot.endAnchor.kind !== 'free')

        if (startIsBound) {
          updated = updateCorridorPoint({
            corridor: updated,
            segmentIndex: 0,
            pointType: 'start',
            position: snapshot.segments[0].start,
          })
        } else if (updated.startAnchor?.kind === 'free' && updated.segments[0]) {
          updated = {
            ...updated,
            startAnchor: {
              kind: 'free',
              position: { ...updated.segments[0].start },
            },
          }
        }
        if (endIsBound) {
          updated = updateCorridorPoint({
            corridor: updated,
            segmentIndex: updated.segments.length - 1,
            pointType: 'end',
            position: snapshot.segments[snapshot.segments.length - 1].end,
          })
        } else if (updated.endAnchor?.kind === 'free' && updated.segments.length > 0) {
          updated = {
            ...updated,
            endAnchor: {
              kind: 'free',
              position: {
                ...updated.segments[updated.segments.length - 1].end,
              },
            },
          }
        }
      } else {
        updated = {
          ...updated,
          startAttachment: undefined,
          endAttachment: undefined,
          startAnchor: updated.segments[0]
            ? { kind: 'free', position: { ...updated.segments[0].start } }
            : undefined,
          endAnchor: updated.segments.length > 0
            ? {
                kind: 'free',
                position: {
                  ...updated.segments[updated.segments.length - 1].end,
                },
              }
            : undefined,
        }
      }

      dispatch(actions.updateCorridor(updated.id, {
        segments: updated.segments,
        segmentIds: updated.segmentIds,
        startAttachment: updated.startAttachment,
        endAttachment: updated.endAttachment,
        startAnchor: updated.startAnchor,
        endAnchor: updated.endAnchor,
      }))
      return
    }
    
    // Handle corridor point editing (resize)
    if (
      corridorPointEdit.isEditing &&
      corridorPointEdit.corridorId !== null &&
      corridorPointEdit.segmentIndex !== null &&
      corridorPointEdit.pointType !== null &&
      corridorPointEdit.corridorSnapshot
    ) {
      const candidate =
        corridorPointEdit.endpoint && corridorPointEdit.preserveAttachments
          ? findEndpointSnapCandidate({
              point: worldPos,
              rooms,
              junctions,
              corridors,
              excludeCorridorId: corridorPointEdit.corridorId,
              threshold: Math.max(18, gridSize * 0.75),
            })
          : null
      let targetPosition = candidate?.position ?? worldPos
      if (!candidate && state.snapToGrid) {
        targetPosition = {
          x: Math.round(worldPos.x / gridSize) * gridSize,
          y: Math.round(worldPos.y / gridSize) * gridSize,
        }
      }

      const updated = updateCorridorPoint({
        corridor: corridorPointEdit.corridorSnapshot,
        segmentIndex: corridorPointEdit.segmentIndex,
        pointType: corridorPointEdit.pointType,
        position: targetPosition,
        endpointBinding: corridorPointEdit.endpoint ? candidate : undefined,
      })

      dispatch(actions.updateCorridor(updated.id, {
        segments: updated.segments,
        segmentIds: updated.segmentIds,
        startAttachment: updated.startAttachment,
        endAttachment: updated.endAttachment,
        startAnchor: updated.startAnchor,
        endAnchor: updated.endAnchor,
      }))
      setCorridorPointEdit(previous => ({
        ...previous,
        snapCandidate: candidate,
      }))
      return
    }
    
    // Handle room resizing
    if (resizeState.isResizing && resizeState.roomId && resizeState.startPos && resizeState.roomStartBounds && resizeState.handle) {
      const dx = worldPos.x - resizeState.startPos.x
      const dy = worldPos.y - resizeState.startPos.y
      const bounds = { ...resizeState.roomStartBounds }
      const minSize = gridSize
      
      switch (resizeState.handle) {
        case 'nw':
          bounds.x = Math.min(bounds.x + dx, bounds.x + bounds.width - minSize)
          bounds.y = Math.min(bounds.y + dy, bounds.y + bounds.height - minSize)
          bounds.width = resizeState.roomStartBounds.width - (bounds.x - resizeState.roomStartBounds.x)
          bounds.height = resizeState.roomStartBounds.height - (bounds.y - resizeState.roomStartBounds.y)
          break
        case 'n':
          bounds.y = Math.min(bounds.y + dy, bounds.y + bounds.height - minSize)
          bounds.height = resizeState.roomStartBounds.height - (bounds.y - resizeState.roomStartBounds.y)
          break
        case 'ne':
          bounds.y = Math.min(bounds.y + dy, bounds.y + bounds.height - minSize)
          bounds.width = Math.max(minSize, resizeState.roomStartBounds.width + dx)
          bounds.height = resizeState.roomStartBounds.height - (bounds.y - resizeState.roomStartBounds.y)
          break
        case 'e':
          bounds.width = Math.max(minSize, resizeState.roomStartBounds.width + dx)
          break
        case 'se':
          bounds.width = Math.max(minSize, resizeState.roomStartBounds.width + dx)
          bounds.height = Math.max(minSize, resizeState.roomStartBounds.height + dy)
          break
        case 's':
          bounds.height = Math.max(minSize, resizeState.roomStartBounds.height + dy)
          break
        case 'sw':
          bounds.x = Math.min(bounds.x + dx, bounds.x + bounds.width - minSize)
          bounds.width = resizeState.roomStartBounds.width - (bounds.x - resizeState.roomStartBounds.x)
          bounds.height = Math.max(minSize, resizeState.roomStartBounds.height + dy)
          break
        case 'w':
          bounds.x = Math.min(bounds.x + dx, bounds.x + bounds.width - minSize)
          bounds.width = resizeState.roomStartBounds.width - (bounds.x - resizeState.roomStartBounds.x)
          break
      }
      
      // Snap to grid if enabled
      if (state.snapToGrid) {
        bounds.x = Math.round(bounds.x / gridSize) * gridSize
        bounds.y = Math.round(bounds.y / gridSize) * gridSize
        bounds.width = Math.round(bounds.width / gridSize) * gridSize
        bounds.height = Math.round(bounds.height / gridSize) * gridSize
      }
      
      dispatch(actions.updateRoom(resizeState.roomId, { bounds }))
      return
    }

    if (isDrawing) {
      dispatch(actions.updateDrawing(worldPos))
    }
    
    // Update marquee selection
    if (marqueeState.isActive) {
      setMarqueeState(prev => ({ ...prev, currentPoint: worldPos }))
      return
    }
    
    // Update corridor preview point
    if (activeTool === EditorTool.Corridor && corridorDrawState.isDrawing) {
      // Try to snap to room walls first
      const snapResult = snapToRoomWall(worldPos, rooms, 30)
      let snappedPos = snapResult.snappedPoint
      
      // If not snapped to wall, use grid snap
      if (!snapResult.roomId && state.snapToGrid) {
        snappedPos = {
          x: Math.round(worldPos.x / gridSize) * gridSize,
          y: Math.round(worldPos.y / gridSize) * gridSize,
        }
      }
      setCorridorDrawState(prev => ({ ...prev, currentPoint: snappedPos }))
    }

    // Handle panning with right mouse button (2) or middle button (4) or Pan tool or Space+LeftClick
    if (isRightMouseDown || e.buttons === 4 || (e.buttons === 1 && activeTool === EditorTool.Pan) || (e.buttons === 1 && isSpacePressed)) {
      dispatch(actions.setViewport({
        x: viewport.x + e.movementX,
        y: viewport.y + e.movementY,
        zoom: viewport.zoom,
      }))
    }
  }, [isDrawing, activeTool, viewport, screenToWorld, dispatch, dragState, resizeState, corridorDragState, corridorPointEdit, corridors, rooms, junctions, state.snapToGrid, gridSize, corridorDrawState.isDrawing, isSpacePressed, marqueeState.isActive])

  const handleMouseUp = useCallback(() => {
    if (gestureCancelledRef.current) {
      gestureCancelledRef.current = false
      return
    }

    // End drag operation
    if (dragState.isDragging) {
      const movedRoomId = dragState.roomId
      let blocked = false
      if (movedRoomId) {
        if (dragState.detachAttachments) {
          for (const snapshot of dragState.attachedCorridorSnapshots) {
            const detached = detachCorridorFromRoom(snapshot, movedRoomId)
            if (detached === snapshot) continue
            dispatch(actions.updateCorridor(snapshot.id, {
              startAttachment: detached.startAttachment,
              endAttachment: detached.endAttachment,
              startAnchor: detached.startAnchor,
              endAnchor: detached.endAnchor,
            }))
          }
        } else {
          const results = dragState.attachedCorridorSnapshots.map(snapshot => ({
            snapshot,
            result: reconcileAttachedCorridor({
              corridor: snapshot,
              rooms,
              changedRoomIds: [movedRoomId],
              gridSize,
            }),
          }))
          blocked = results.some(({ result }) => result.status === 'blocked')

          if (blocked && dragState.roomSnapshot) {
            dispatch(actions.updateRoom(movedRoomId, dragState.roomSnapshot))
            for (const snapshot of dragState.attachedCorridorSnapshots) {
              dispatch(actions.updateCorridor(snapshot.id, snapshot))
            }
            console.warn('Room move cancelled: an attached corridor could not be rerouted')
          } else {
            for (const { snapshot, result } of results) {
              if (result.status !== 'rerouted') continue
              dispatch(actions.updateCorridor(snapshot.id, {
                segments: result.corridor.segments,
                startAnchor: result.corridor.startAnchor,
                endAnchor: result.corridor.endAnchor,
              }))
            }
          }
        }
      }
      setDragState({
        isDragging: false,
        roomId: null,
        startPos: null,
        roomSnapshot: null,
        attachedCorridorSnapshots: [],
        detachAttachments: false,
      })
      if (!blocked) {
        dispatch(actions.pushHistory())
      }
      return
    }
    
    // End corridor drag operation
    if (corridorDragState.isDragging) {
      setCorridorDragState({
        isDragging: false,
        corridorId: null,
        startPos: null,
        originalSegments: null,
        corridorSnapshot: null,
        preserveAttachments: true,
      })
      dispatch(actions.pushHistory())
      return
    }
    
    // End corridor point edit operation
    if (corridorPointEdit.isEditing) {
      setCorridorPointEdit({ 
        isEditing: false, 
        corridorId: null, 
        segmentIndex: 0, 
        pointType: 'start', 
        startPos: null,
        corridorSnapshot: null,
        endpoint: null,
        preserveAttachments: true,
        snapCandidate: null,
      })
      dispatch(actions.pushHistory())
      return
    }
    
    // End resize operation
    if (resizeState.isResizing) {
      setResizeState({ isResizing: false, roomId: null, handle: null, startPos: null, roomStartBounds: null })
      dispatch(actions.pushHistory())
      return
    }
    
    // End marquee selection
    if (marqueeState.isActive && marqueeState.startPoint && marqueeState.currentPoint) {
      const minX = Math.min(marqueeState.startPoint.x, marqueeState.currentPoint.x)
      const maxX = Math.max(marqueeState.startPoint.x, marqueeState.currentPoint.x)
      const minY = Math.min(marqueeState.startPoint.y, marqueeState.currentPoint.y)
      const maxY = Math.max(marqueeState.startPoint.y, marqueeState.currentPoint.y)
      
      // Check if marquee is too small (just a click)
      if (maxX - minX > 5 || maxY - minY > 5) {
        // Find rooms within marquee bounds
        const selectedRoomIds: string[] = []
        for (const room of rooms) {
          const { x, y, width, height } = room.bounds
          // Check if room intersects with marquee
          if (x < maxX && x + width > minX && y < maxY && y + height > minY) {
            selectedRoomIds.push(room.id)
          }
        }
        
        // Find corridors within marquee bounds
        const selectedCorridorIds: string[] = []
        for (const corridor of corridors) {
          // Check if any segment intersects with marquee
          let intersects = false
          for (const segment of corridor.segments) {
            // Check if segment endpoints are within marquee
            const startInside = segment.start.x >= minX && segment.start.x <= maxX && 
                               segment.start.y >= minY && segment.start.y <= maxY
            const endInside = segment.end.x >= minX && segment.end.x <= maxX && 
                             segment.end.y >= minY && segment.end.y <= maxY
            if (startInside || endInside) {
              intersects = true
              break
            }
          }
          if (intersects) {
            selectedCorridorIds.push(corridor.id)
          }
        }
        
        // Determine selection type (prefer rooms if both types selected)
        if (selectedRoomIds.length > 0) {
          dispatch(actions.select({ type: 'room', ids: selectedRoomIds }))
        } else if (selectedCorridorIds.length > 0) {
          dispatch(actions.select({ type: 'corridor', ids: selectedCorridorIds }))
        }
      }
      
      setMarqueeState({ isActive: false, startPoint: null, currentPoint: null })
      return
    }
    
    if (activeTool === EditorTool.Room && isDrawing && drawStartPoint && drawCurrentPoint) {
      const minX = Math.min(drawStartPoint.x, drawCurrentPoint.x)
      const minY = Math.min(drawStartPoint.y, drawCurrentPoint.y)
      const width = Math.abs(drawCurrentPoint.x - drawStartPoint.x)
      const height = Math.abs(drawCurrentPoint.y - drawStartPoint.y)
      
      dispatch(actions.finishDrawing())
      
      if (width >= gridSize && height >= gridSize) {
        const roomConfig = ROOM_TYPE_CONFIGS[activeRoomType]
        const roomRect: Rect = { x: minX, y: minY, width, height }
        
        dispatch(actions.addRoom({
          type: activeRoomType,
          name: roomConfig.name,
          bounds: roomRect,
          doors: [],
          objects: [],
          metadata: {},
          deckLevel: 1,
          isVisible: true,
          isLocked: false,
        }))
        
        dispatch(actions.pushHistory())
      }
    }
  }, [activeTool, isDrawing, activeRoomType, gridSize, drawStartPoint, drawCurrentPoint, dispatch, dragState, resizeState, corridorDragState, corridorPointEdit, marqueeState, rooms, corridors])

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseUp])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // Shift+wheel = horizontal pan
    if (e.shiftKey) {
      dispatch(actions.setViewport({
        x: viewport.x - e.deltaY,
        y: viewport.y,
        zoom: viewport.zoom,
      }))
      return
    }

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(4, viewport.zoom * zoomFactor))

    // Zoom towards mouse position
    const worldX = (mouseX - viewport.x) / viewport.zoom
    const worldY = (mouseY - viewport.y) / viewport.zoom

    dispatch(actions.setViewport({
      zoom: newZoom,
      x: mouseX - worldX * newZoom,
      y: mouseY - worldY * newZoom,
    }))
  }, [viewport, dispatch])

  // Function to finish corridor drawing - defined before handleKeyDown that uses it
  const finishCorridorDrawing = useCallback(() => {
    if (corridorDrawState.points.length < 2) {
      setCorridorDrawState({ isDrawing: false, points: [], currentPoint: null, autoRouteMode: true })
      return
    }
    
    // Get the end attachment from current state
    const endAttachment = corridorDrawState.currentAttachment
    const startAttachment = corridorDrawState.startAttachment
    
    // Corridor width - make it thinner
    const corridorWidth = Math.floor(gridSize * 0.6)
    
    // Use auto-routing if enabled
    if (corridorDrawState.autoRouteMode && corridorDrawState.points.length === 2) {
      const start = corridorDrawState.points[0]
      const end = corridorDrawState.points[1]
      
      // Auto-route around rooms
      const routeResult = autoRouteCorridor(start, end, rooms, corridors, gridSize, corridorWidth, false)
      
      // If there are intersection points, show confirmation dialog
      if (routeResult.requiresConfirmation && routeResult.intersections.length > 0) {
        setIntersectionDialog({
          isOpen: true,
          pendingSegments: routeResult.segments,
          intersectionPoints: routeResult.intersections,
          startAttachment,
          endAttachment,
        })
        setCorridorDrawState({ isDrawing: false, points: [], currentPoint: null, autoRouteMode: true })
        return
      }
      
      // No intersections or allowed - create the corridor
      dispatch(actions.addCorridor({
        style: CorridorStyle.Standard,
        segments: orthogonalizeSegments(routeResult.segments),
        width: corridorWidth,
        doors: [],
        connectedRoomIds: [],
        deckLevel: 1,
        startAttachment,
        endAttachment,
      }))
    } else {
      // Manual mode - create segments from points but check for room collisions
      const segments: Array<{ start: Point; end: Point }> = []
      let allSegmentsValid = true
      
      for (let i = 0; i < corridorDrawState.points.length - 1; i++) {
        const start = corridorDrawState.points[i]
        const end = corridorDrawState.points[i + 1]
        
        // Check if segment passes through rooms
        const collision = checkCorridorRoomCollision(start, end, rooms, corridorWidth)
        if (collision.collides) {
          // Auto-route this segment around rooms
          const routeResult = autoRouteCorridor(start, end, rooms, corridors, gridSize, corridorWidth, true)
          segments.push(...orthogonalizeSegments(routeResult.segments))
        } else {
          segments.push(...orthogonalizeSegment(start, end))
        }
      }
      
      if (allSegmentsValid && segments.length > 0) {
        dispatch(actions.addCorridor({
          style: CorridorStyle.Standard,
          segments,
          width: corridorWidth,
          doors: [],
          connectedRoomIds: [],
          deckLevel: 1,
          startAttachment,
          endAttachment,
        }))
      }
    }
    
    dispatch(actions.pushHistory())
    setCorridorDrawState({ isDrawing: false, points: [], currentPoint: null, autoRouteMode: true })
  }, [corridorDrawState, dispatch, gridSize, rooms, corridors])
  
  // Handle intersection dialog responses
  const handleIntersectionConfirm = useCallback((allowIntersection: boolean) => {
    if (intersectionDialog.pendingSegments.length > 0) {
      if (allowIntersection) {
        // Create corridor with intersection (crossroad)
        dispatch(actions.addCorridor({
          style: CorridorStyle.Standard,
          segments: orthogonalizeSegments(intersectionDialog.pendingSegments),
          width: Math.floor(gridSize * 0.6),
          doors: [],
          connectedRoomIds: [],
          deckLevel: 1,
          startAttachment: intersectionDialog.startAttachment,
          endAttachment: intersectionDialog.endAttachment,
        }))
        dispatch(actions.pushHistory())
      } else {
        // Try to find alternative route without intersections
        // For now, just don't create the corridor
        console.log('User declined intersection - corridor not created')
      }
    }
    setIntersectionDialog({ isOpen: false, pendingSegments: [], intersectionPoints: [], startAttachment: undefined, endAttachment: undefined })
  }, [intersectionDialog, dispatch, gridSize])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }
    
    // Space key for temporary pan mode
    if (e.key === ' ' && !e.repeat) {
      e.preventDefault()
      setIsSpacePressed(true)
      return
    }
    
    if (e.key === 'Escape') {
      let cancelledGesture = false

      if (dragState.isDragging && dragState.roomId && dragState.roomSnapshot) {
        dispatch(actions.updateRoom(dragState.roomId, dragState.roomSnapshot))
        for (const snapshot of dragState.attachedCorridorSnapshots) {
          dispatch(actions.updateCorridor(snapshot.id, snapshot))
        }
        setDragState({
          isDragging: false,
          roomId: null,
          startPos: null,
          roomSnapshot: null,
          attachedCorridorSnapshots: [],
          detachAttachments: false,
        })
        cancelledGesture = true
      }

      if (corridorDragState.isDragging && corridorDragState.corridorSnapshot) {
        dispatch(actions.updateCorridor(
          corridorDragState.corridorSnapshot.id,
          corridorDragState.corridorSnapshot
        ))
        setCorridorDragState({
          isDragging: false,
          corridorId: null,
          startPos: null,
          originalSegments: null,
          corridorSnapshot: null,
          preserveAttachments: true,
        })
        cancelledGesture = true
      }

      if (corridorPointEdit.isEditing && corridorPointEdit.corridorSnapshot) {
        dispatch(actions.updateCorridor(
          corridorPointEdit.corridorSnapshot.id,
          corridorPointEdit.corridorSnapshot
        ))
        setCorridorPointEdit({
          isEditing: false,
          corridorId: null,
          segmentIndex: null,
          pointType: null,
          startPos: null,
          corridorSnapshot: null,
          endpoint: null,
          preserveAttachments: true,
          snapCandidate: null,
        })
        cancelledGesture = true
      }

      if (resizeState.isResizing && resizeState.roomId && resizeState.roomStartBounds) {
        dispatch(actions.updateRoom(resizeState.roomId, {
          bounds: resizeState.roomStartBounds,
        }))
        setResizeState({
          isResizing: false,
          roomId: null,
          handle: null,
          startPos: null,
          roomStartBounds: null,
        })
        cancelledGesture = true
      }

      if (cancelledGesture) {
        gestureCancelledRef.current = true
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }

      dispatch(actions.cancelDrawing())
      dispatch(actions.clearSelection())
      // Cancel corridor drawing
      setCorridorDrawState({ isDrawing: false, points: [], currentPoint: null, autoRouteMode: true })
      // Close intersection dialog if open
      setIntersectionDialog({ isOpen: false, pendingSegments: [], intersectionPoints: [] })
    }
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Handle deletion of selected items
      if (selection.type === 'corridor-segment' && selection.ids.length > 0) {
        // Delete selected segments from corridors
        for (const segmentId of selection.ids) {
          const [corridorId, segmentIndexStr] = segmentId.split(':')
          const segmentIndex = parseInt(segmentIndexStr, 10)
          const corridor = corridors.find(c => c.id === corridorId)
          if (corridor && !isNaN(segmentIndex) && corridor.segments.length > 1) {
            // Remove the segment and update corridor
            const newSegments = corridor.segments.filter((_, idx) => idx !== segmentIndex)
            dispatch(actions.updateCorridor(corridorId, { segments: newSegments }))
          } else if (corridor && corridor.segments.length === 1) {
            // If only one segment, delete the whole corridor
            dispatch(actions.deleteCorridors([corridorId]))
          }
        }
        setSelectedSegment(null)
        dispatch(actions.clearSelection())
        dispatch(actions.pushHistory())
      } else if (selection.type === 'room' && selection.ids.length > 0) {
        dispatch(actions.deleteRooms(selection.ids))
        dispatch(actions.pushHistory())
      } else if (selection.type === 'corridor' && selection.ids.length > 0) {
        dispatch(actions.deleteCorridors(selection.ids))
        dispatch(actions.pushHistory())
      }
    }
    
    // Enter to finish corridor
    if (e.key === 'Enter' && corridorDrawState.isDrawing && corridorDrawState.points.length >= 2) {
      finishCorridorDrawing()
    }
    
    // Tool shortcuts (handled in EditorLayout.tsx now)
    
    // Grid toggle
    if (e.key === 'g' || e.key === 'G') {
      dispatch(actions.toggleGrid())
    }
    
    // Snap toggle
    if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
      dispatch(actions.toggleSnapToGrid())
    }
  }, [selection, dispatch, corridorDrawState, finishCorridorDrawing, corridors, dragState, corridorDragState, corridorPointEdit, resizeState])
  
  // Handle context menu (right click)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()

    const completedGesture = rightMousePanRef.current
    rightMousePanRef.current = idleRightMousePan()
    if (completedGesture.moved) {
      setContextMenu(previous => previous.isOpen ? { ...previous, isOpen: false } : previous)
      return
    }
    
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = screenToWorld(screenX, screenY)
    
    // Preserve the point-specific menu for a stationary right click.
    const pointHitRadius = 14 / Math.max(viewport.zoom, 0.1)
    for (const corridor of corridors) {
      const renderableSegments = getRenderableCorridorSegments(corridor)
      for (let segmentIndex = 0; segmentIndex < renderableSegments.length; segmentIndex++) {
        const segment = renderableSegments[segmentIndex]
        for (const pointType of ['start', 'end'] as const) {
          const point = segment[pointType]
          if (Math.hypot(worldPos.x - point.x, worldPos.y - point.y) > pointHitRadius) {
            continue
          }

          if (!selection.ids.includes(corridor.id)) {
            dispatch(actions.select({ type: 'corridor', ids: [corridor.id] }))
          }
          setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            targetType: 'corridor-point',
            targetId: corridor.id,
            segmentIndex,
            pointType,
            worldPos: { ...point },
          })
          return
        }
      }
    }

    // Check if clicked on a room
    for (const room of rooms) {
      const { x, y, width, height } = room.bounds
      if (worldPos.x >= x && worldPos.x <= x + width && worldPos.y >= y && worldPos.y <= y + height) {
        // Select this room if not already selected
        if (!selection.ids.includes(room.id)) {
          dispatch(actions.select({ type: 'room', ids: [room.id] }))
        }
        setContextMenu({
          isOpen: true,
          x: e.clientX,
          y: e.clientY,
          targetType: 'room',
          targetId: room.id,
        })
        return
      }
    }
    
    // Check if clicked on a corridor
    for (const corridor of corridors) {
      for (let i = 0; i < corridor.segments.length; i++) {
        const seg = corridor.segments[i]
        const dist = pointToSegmentDistance(worldPos, seg.start, seg.end)
        if (dist < (corridor.width ?? 6) + 10) {
          if (!selection.ids.includes(corridor.id)) {
            dispatch(actions.select({ type: 'corridor', ids: [corridor.id] }))
          }
          setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            targetType: 'corridor',
            targetId: corridor.id,
          })
          return
        }
      }
    }
    
    // Clicked on empty canvas
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      targetType: 'canvas',
      targetId: null,
    })
  }, [rooms, corridors, selection, dispatch, screenToWorld, viewport.zoom])
  
  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }))
  }, [])
  
  // Context menu actions
  const handleContextMenuAction = useCallback((action: string) => {
    closeContextMenu()
    
    switch (action) {
      case 'delete':
        if (selection.type === 'corridor-segment' && selection.ids.length > 0) {
          // Delete selected segments from corridors
          for (const segmentId of selection.ids) {
            const [corridorId, segmentIndexStr] = segmentId.split(':')
            const segmentIndex = parseInt(segmentIndexStr, 10)
            const corridor = corridors.find(c => c.id === corridorId)
            if (corridor && !isNaN(segmentIndex) && corridor.segments.length > 1) {
              // Remove the segment and update corridor
              const newSegments = corridor.segments.filter((_, idx) => idx !== segmentIndex)
              dispatch(actions.updateCorridor(corridorId, { segments: newSegments }))
            } else if (corridor && corridor.segments.length === 1) {
              // If only one segment, delete the whole corridor
              dispatch(actions.deleteCorridors([corridorId]))
            }
          }
          setSelectedSegment(null)
          dispatch(actions.clearSelection())
        } else if (selection.ids.length > 0) {
          // Delete selected rooms/corridors
          const roomIds = selection.ids.filter((id: string) => rooms.find(r => r.id === id))
          const corridorIds = selection.ids.filter((id: string) => corridors.find(c => c.id === id))
          
          if (roomIds.length > 0) {
            dispatch(actions.deleteRooms(roomIds))
          }
          if (corridorIds.length > 0) {
            dispatch(actions.deleteCorridors(corridorIds))
          }
          dispatch(actions.clearSelection())
        }
        break
        
      case 'duplicate':
        if (contextMenu.targetType === 'room' && contextMenu.targetId) {
          const room = rooms.find(r => r.id === contextMenu.targetId)
          if (room) {
            const newRoom = {
              ...room,
              id: `room_${Date.now()}`,
              bounds: {
                ...room.bounds,
                x: room.bounds.x + 50,
                y: room.bounds.y + 50,
              },
            }
            dispatch(actions.addRoom(newRoom))
            dispatch(actions.select({ type: 'room', ids: [newRoom.id] }))
          }
        }
        break
        
      case 'bring-to-front':
        // Would need z-index support in the data model
        console.log('Bring to front not yet implemented')
        break
        
      case 'send-to-back':
        // Would need z-index support in the data model
        console.log('Send to back not yet implemented')
        break
        
      case 'select-all':
        const allIds = [...rooms.map(r => r.id), ...corridors.map(c => c.id)]
        dispatch(actions.select({ type: 'room', ids: allIds }))
        break
    }
  }, [selection, rooms, corridors, dispatch, contextMenu, closeContextMenu])
  
  // Handle double click to finish corridor or add bend point
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const worldPos = screenToWorld(screenX, screenY)
    
    // Finish corridor drawing
    if (activeTool === EditorTool.Corridor && corridorDrawState.isDrawing) {
      e.preventDefault()
      finishCorridorDrawing()
      return
    }
    
    // Add bend point to existing corridor (double-click on corridor segment)
    if (activeTool === EditorTool.Select) {
      for (const corridor of corridors) {
        for (let segIdx = 0; segIdx < corridor.segments.length; segIdx++) {
          const segment = corridor.segments[segIdx]
          
          // Calculate distance from click to segment
          const dx = segment.end.x - segment.start.x
          const dy = segment.end.y - segment.start.y
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len === 0) continue
          
          // Project point onto line
          const t = Math.max(0, Math.min(1, 
            ((worldPos.x - segment.start.x) * dx + (worldPos.y - segment.start.y) * dy) / (len * len)
          ))
          
          const closestX = segment.start.x + t * dx
          const closestY = segment.start.y + t * dy
          const dist = Math.sqrt((worldPos.x - closestX) ** 2 + (worldPos.y - closestY) ** 2)
          
          // If click is on segment (within corridor width), add bend point
          if (dist < (corridor.width || 20) / 2 + 10 && t > 0.1 && t < 0.9) {
            // Snap to grid if enabled
            let bendPoint = { x: closestX, y: closestY }
            if (state.snapToGrid) {
              bendPoint = {
                x: Math.round(closestX / gridSize) * gridSize,
                y: Math.round(closestY / gridSize) * gridSize,
              }
            }
            
            // Split segment into two
            const newSegments = [...corridor.segments]
            const newSeg1 = { start: segment.start, end: bendPoint }
            const newSeg2 = { start: bendPoint, end: segment.end }
            newSegments.splice(segIdx, 1, newSeg1, newSeg2)
            
            dispatch(actions.updateCorridor(corridor.id, { segments: newSegments }))
            dispatch(actions.pushHistory())
            console.log('Added bend point to corridor')
            return
          }
        }
      }
    }
  }, [activeTool, corridorDrawState.isDrawing, finishCorridorDrawing, corridors, screenToWorld, dispatch, state.snapToGrid, gridSize])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    
    // Handle keyup for Space key (end temporary pan)
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setIsSpacePressed(false)
      }
    }
    window.addEventListener('keyup', handleKeyUp)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown])
  
  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.isOpen) {
        closeContextMenu()
      }
    }
    
    const handleContextMenuEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }

    window.addEventListener('click', handleClickOutside)
    window.addEventListener('keydown', handleContextMenuEscape)
    
    return () => {
      window.removeEventListener('click', handleClickOutside)
      window.removeEventListener('keydown', handleContextMenuEscape)
    }
  }, [contextMenu.isOpen, closeContextMenu])

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="canvas-container w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />
      
      {/* Context Menu */}
      {contextMenu.isOpen && (
        <div
          className="fixed bg-space-800 border border-space-600 rounded-md shadow-lg py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.targetType === 'room' && (
            <>
              <button
                className="w-full px-4 py-2 text-left text-sm text-space-100 hover:bg-space-700 flex items-center gap-2"
                onClick={() => handleContextMenuAction('duplicate')}
              >
                <DuplicateIcon size={16} /> Duplicate
              </button>
              <button
                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-space-700 flex items-center gap-2"
                onClick={() => handleContextMenuAction('delete')}
              >
                <TrashIcon size={16} /> Delete
              </button>
              <div className="border-t border-space-600 my-1"></div>
              <button
                className="w-full px-4 py-2 text-left text-sm text-space-100 hover:bg-space-700 flex items-center gap-2"
                onClick={() => handleContextMenuAction('bring-to-front')}
              >
                <BringToFrontIcon size={16} /> Bring to Front
              </button>
              <button
                className="w-full px-4 py-2 text-left text-sm text-space-100 hover:bg-space-700 flex items-center gap-2"
                onClick={() => handleContextMenuAction('send-to-back')}
              >
                <SendToBackIcon size={16} /> Send to Back
              </button>
            </>
          )}
          
          {contextMenu.targetType === 'corridor' && (
            <>
              <button
                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-space-700 flex items-center gap-2"
                onClick={() => handleContextMenuAction('delete')}
              >
                <TrashIcon size={16} /> Delete Corridor
              </button>
            </>
          )}
          
          {contextMenu.targetType === 'corridor-point' && contextMenu.targetId && contextMenu.worldPos && (
            <>
              <div className="px-4 py-2 text-xs text-space-400 border-b border-space-600">
                Corridor point
              </div>
              
              {/* List nearby rooms to attach to */}
              {rooms.filter(room => {
                const { x, y, width, height } = room.bounds
                const pt = contextMenu.worldPos!
                // Check if point is near any wall of this room
                const threshold = 50
                const nearTop = pt.x >= x && pt.x <= x + width && Math.abs(pt.y - y) < threshold
                const nearBottom = pt.x >= x && pt.x <= x + width && Math.abs(pt.y - (y + height)) < threshold
                const nearLeft = pt.y >= y && pt.y <= y + height && Math.abs(pt.x - x) < threshold
                const nearRight = pt.y >= y && pt.y <= y + height && Math.abs(pt.x - (x + width)) < threshold
                return nearTop || nearBottom || nearLeft || nearRight
              }).map(room => (
                <button
                  key={room.id}
                  className="w-full px-4 py-2 text-left text-sm text-space-100 hover:bg-space-700 flex items-center gap-2"
                  onClick={() => {
                    // Find which wall is closest
                    const { x, y, width, height } = room.bounds
                    const pt = contextMenu.worldPos!
                    const walls: Array<{ wall: 'top' | 'right' | 'bottom' | 'left'; dist: number; offset: number }> = [
                      { wall: 'top', dist: Math.abs(pt.y - y), offset: Math.max(0, Math.min(1, (pt.x - x) / width)) },
                      { wall: 'bottom', dist: Math.abs(pt.y - (y + height)), offset: Math.max(0, Math.min(1, (pt.x - x) / width)) },
                      { wall: 'left', dist: Math.abs(pt.x - x), offset: Math.max(0, Math.min(1, (pt.y - y) / height)) },
                      { wall: 'right', dist: Math.abs(pt.x - (x + width)), offset: Math.max(0, Math.min(1, (pt.y - y) / height)) },
                    ]
                    const closest = walls.reduce((a, b) => a.dist < b.dist ? a : b)
                    
                    const corridor = corridors.find(c => c.id === contextMenu.targetId)
                    if (!corridor) return
                    
                    const isStartPoint = contextMenu.segmentIndex === 0 && contextMenu.pointType === 'start'
                    const isEndPoint = contextMenu.segmentIndex === corridor.segments.length - 1 && contextMenu.pointType === 'end'
                    
                    const attachment: CorridorAttachment = {
                      roomId: room.id,
                      wall: closest.wall,
                      offset: closest.offset,
                    }
                    
                    // Update corridor with new attachment
                    const updates: Partial<typeof corridor> = {}
                    if (isStartPoint) {
                      updates.startAttachment = attachment
                    } else if (isEndPoint) {
                      updates.endAttachment = attachment
                    }
                    
                    dispatch(actions.updateCorridor(corridor.id, updates))
                    dispatch(actions.pushHistory())
                    closeContextMenu()
                  }}
                >
                  <RoomIcon size={16} /> Attach to: {room.name}
                </button>
              ))}
              
              {/* Option to detach if already attached */}
              {(() => {
                const corridor = corridors.find(c => c.id === contextMenu.targetId)
                if (!corridor) return null
                const isStartPoint = contextMenu.segmentIndex === 0 && contextMenu.pointType === 'start'
                const isEndPoint = contextMenu.segmentIndex === corridor.segments.length - 1 && contextMenu.pointType === 'end'
                const hasAttachment = (isStartPoint && corridor.startAttachment) || (isEndPoint && corridor.endAttachment)
                
                if (hasAttachment) {
                  return (
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-orange-400 hover:bg-space-700 flex items-center gap-2"
                      onClick={() => {
                        const updates: Partial<typeof corridor> = {}
                        if (isStartPoint) {
                          updates.startAttachment = undefined
                        } else if (isEndPoint) {
                          updates.endAttachment = undefined
                        }
                        dispatch(actions.updateCorridor(corridor.id, updates))
                        dispatch(actions.pushHistory())
                        closeContextMenu()
                      }}
                    >
                      <TrashIcon size={16} /> Detach from room
                    </button>
                  )
                }
                return null
              })()}
              
              <div className="border-t border-space-600 my-1"></div>
              
              <button
                className="w-full px-4 py-2 text-left text-sm text-orange-400 hover:bg-space-700 flex items-center gap-2"
                onClick={() => {
                  // Delete this point (merge segments)
                  const corridor = corridors.find(c => c.id === contextMenu.targetId)
                  if (!corridor || corridor.segments.length < 2) return
                  
                  const segIdx = contextMenu.segmentIndex!
                  const ptType = contextMenu.pointType!
                  
                  // Can only delete intermediate points
                  const isStartPoint = segIdx === 0 && ptType === 'start'
                  const isEndPoint = segIdx === corridor.segments.length - 1 && ptType === 'end'
                  
                  if (!isStartPoint && !isEndPoint) {
                    // Merge segments around this point
                    const newSegments = [...corridor.segments]
                    if (ptType === 'end' && segIdx < newSegments.length - 1) {
                      // Merge with next segment
                      newSegments[segIdx] = {
                        start: newSegments[segIdx].start,
                        end: newSegments[segIdx + 1].end,
                      }
                      newSegments.splice(segIdx + 1, 1)
                    } else if (ptType === 'start' && segIdx > 0) {
                      // Merge with previous segment
                      newSegments[segIdx - 1] = {
                        start: newSegments[segIdx - 1].start,
                        end: newSegments[segIdx].end,
                      }
                      newSegments.splice(segIdx, 1)
                    }
                    
                    dispatch(actions.updateCorridor(corridor.id, { segments: newSegments }))
                    dispatch(actions.pushHistory())
                  }
                  closeContextMenu()
                }}
              >
                <TrashIcon size={16} /> Delete point
              </button>
              
              {/* Delete segment option */}
              <button
                className="w-full px-4 py-2 text-left text-sm text-orange-400 hover:bg-space-700 flex items-center gap-2"
                onClick={() => {
                  const corridor = corridors.find(c => c.id === contextMenu.targetId)
                  if (!corridor) return
                  
                  const segIdx = contextMenu.segmentIndex!
                  
                  if (corridor.segments.length === 1) {
                    // Only one segment - delete the whole corridor
                    dispatch(actions.deleteCorridors([corridor.id]))
                  } else {
                    // Remove this segment and reconnect
                    const newSegments = [...corridor.segments]
                    
                    if (segIdx === 0) {
                      // Remove first segment - new start is second segment's start
                      newSegments.splice(0, 1)
                    } else if (segIdx === newSegments.length - 1) {
                      // Remove last segment
                      newSegments.splice(segIdx, 1)
                    } else {
                      // Remove middle segment - connect previous end to next start
                      newSegments[segIdx - 1] = {
                        start: newSegments[segIdx - 1].start,
                        end: newSegments[segIdx + 1].start,
                      }
                      newSegments.splice(segIdx, 1)
                    }
                    
                    dispatch(actions.updateCorridor(corridor.id, { segments: newSegments }))
                  }
                  dispatch(actions.pushHistory())
                  closeContextMenu()
                }}
              >
                <TrashIcon size={16} /> Delete segment
              </button>
              
              {/* Delete corridor option */}
              <button
                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-space-700 flex items-center gap-2"
                onClick={() => {
                  const corridor = corridors.find(c => c.id === contextMenu.targetId)
                  if (!corridor) return
                  dispatch(actions.deleteCorridors([corridor.id]))
                  dispatch(actions.pushHistory())
                  closeContextMenu()
                }}
              >
                <TrashIcon size={16} /> Delete corridor
              </button>
            </>
          )}
          
          {contextMenu.targetType === 'canvas' && (
            <>
              <button
                className="w-full px-4 py-2 text-left text-sm text-space-100 hover:bg-space-700 flex items-center gap-2"
                onClick={() => handleContextMenuAction('select-all')}
              >
                <SelectAllIcon size={16} /> Select All
              </button>
            </>
          )}
        </div>
      )}
      
      {/* Corridor Intersection Dialog */}
      {intersectionDialog.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-space-800 border border-space-600 rounded-lg shadow-xl p-6 max-w-md">
            <h3 className="text-lg font-semibold text-space-100 mb-2">
              Corridor intersection
            </h3>
            <p className="text-space-300 mb-4">
              New corridor crosses an existing one. Create a junction?
            </p>
            <div className="text-sm text-space-400 mb-4">
              Intersections found: {intersectionDialog.intersectionPoints.length}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 bg-space-700 hover:bg-space-600 text-space-100 rounded-md transition-colors"
                onClick={() => handleIntersectionConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-cyber-600 hover:bg-cyber-500 text-white rounded-md transition-colors"
                onClick={() => handleIntersectionConfirm(true)}
              >
                Create junction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
