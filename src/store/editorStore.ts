import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import {
  type MapProject,
  type Room,
  type Corridor,
  type MapObject,
  type Deck,
  type Layer,
  type Viewport,
  type Selection,
  type MapTheme,
  type RoomPreset,
  EditorTool,
  RoomType,
  LayerType,
  MapThemeId,
  MAP_THEMES,
  DEFAULT_LAYERS,
  type Point,
  type Rect,
} from '@core/types'

// ============================================================================
// Store Types
// ============================================================================

interface HistoryEntry {
  decks: Deck[]
  timestamp: number
}

interface EditorState {
  // Project
  project: MapProject | null
  isDirty: boolean
  
  // Current deck
  activeDeckId: string | null
  
  // Viewport
  viewport: Viewport
  
  // Tool state
  activeTool: EditorTool
  activeRoomType: RoomType
  
  // Selection
  selection: Selection
  hoveredId: string | null
  
  // Drawing state
  isDrawing: boolean
  drawStartPoint: Point | null
  drawCurrentPoint: Point | null
  
  // Layers
  layers: Layer[]
  activeLayerId: LayerType
  
  // Theme
  activeTheme: MapTheme
  
  // Presets
  presets: RoomPreset[]
  
  // History for undo/redo
  history: HistoryEntry[]
  historyIndex: number
  
  // UI State
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
}

interface EditorActions {
  // Project actions
  newProject: (name: string) => void
  loadProject: (project: MapProject) => void
  saveProject: () => MapProject | null
  
  // Deck actions
  addDeck: (name: string) => void
  removeDeck: (deckId: string) => void
  setActiveDeck: (deckId: string) => void
  
  // Room actions
  addRoom: (room: Omit<Room, 'id'>) => string
  updateRoom: (roomId: string, updates: Partial<Room>) => void
  removeRoom: (roomId: string) => void
  
  // Corridor actions
  addCorridor: (corridor: Omit<Corridor, 'id'>) => string
  updateCorridor: (corridorId: string, updates: Partial<Corridor>) => void
  removeCorridor: (corridorId: string) => void
  
  // Object actions
  addObject: (roomId: string, object: Omit<MapObject, 'id'>) => string
  updateObject: (roomId: string, objectId: string, updates: Partial<MapObject>) => void
  removeObject: (roomId: string, objectId: string) => void
  
  // Tool actions
  setActiveTool: (tool: EditorTool) => void
  setActiveRoomType: (type: RoomType) => void
  
  // Selection actions
  select: (type: Selection['type'], ids: string[]) => void
  clearSelection: () => void
  setHovered: (id: string | null) => void
  
  // Drawing actions
  startDrawing: (point: Point) => void
  updateDrawing: (point: Point) => void
  finishDrawing: () => Rect | null
  cancelDrawing: () => void
  
  // Viewport actions
  setViewport: (viewport: Partial<Viewport>) => void
  zoomIn: () => void
  zoomOut: () => void
  resetViewport: () => void
  
  // Layer actions
  setLayerVisibility: (layerId: LayerType, visible: boolean) => void
  setLayerLocked: (layerId: LayerType, locked: boolean) => void
  setActiveLayer: (layerId: LayerType) => void
  
  // Theme actions
  setTheme: (themeId: MapThemeId) => void
  
  // Grid actions
  toggleGrid: () => void
  toggleSnapToGrid: () => void
  setGridSize: (size: number) => void
  
  // History actions
  undo: () => void
  redo: () => void
  pushHistory: () => void
  
  // Utility
  getActiveDeck: () => Deck | null
  snapPoint: (point: Point) => Point
}

type EditorStore = EditorState & EditorActions

// ============================================================================
// Initial State
// ============================================================================

const initialState: EditorState = {
  project: null,
  isDirty: false,
  activeDeckId: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  activeTool: EditorTool.Select,
  activeRoomType: RoomType.Generic,
  selection: { type: null, ids: [] },
  hoveredId: null,
  isDrawing: false,
  drawStartPoint: null,
  drawCurrentPoint: null,
  layers: [...DEFAULT_LAYERS],
  activeLayerId: LayerType.Structure,
  activeTheme: MAP_THEMES[MapThemeId.Blueprint],
  presets: [],
  history: [],
  historyIndex: -1,
  showGrid: true,
  snapToGrid: true,
  gridSize: 32,
}

// ============================================================================
// Store Implementation (without immer - direct state updates)
// ============================================================================

export const useEditorStore = create<EditorStore>()((set, get) => ({
  ...initialState,

  // ========================================================================
  // Project Actions
  // ========================================================================
  
  newProject: (name: string) => {
    const projectId = uuid()
    const deckId = uuid()
    
    const newDecks: Deck[] = [{
      id: deckId,
      name: 'Deck 1',
      level: 1,
      rooms: [],
      corridors: [],
    }]
    
    set({
      project: {
        id: projectId,
        name,
        description: '',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        gridSize: 32,
        decks: newDecks,
        layers: [...DEFAULT_LAYERS],
        theme: MAP_THEMES[MapThemeId.Blueprint],
        metadata: {},
      },
      activeDeckId: deckId,
      isDirty: false,
      history: [{
        decks: JSON.parse(JSON.stringify(newDecks)),
        timestamp: Date.now(),
      }],
      historyIndex: 0,
    })
  },

  loadProject: (project: MapProject) => {
    set({
      project,
      activeDeckId: project.decks[0]?.id ?? null,
      layers: project.layers,
      activeTheme: project.theme,
      gridSize: project.gridSize,
      isDirty: false,
      history: [{
        decks: JSON.parse(JSON.stringify(project.decks)),
        timestamp: Date.now(),
      }],
      historyIndex: 0,
    })
  },

  saveProject: () => {
    const { project } = get()
    if (!project) return null
    
    const updatedProject = {
      ...project,
      updatedAt: new Date().toISOString(),
    }
    
    set({ project: updatedProject, isDirty: false })
    return updatedProject
  },

  // ========================================================================
  // Deck Actions
  // ========================================================================

  addDeck: (name: string) => {
    const { project } = get()
    if (!project) return
    
    const deckId = uuid()
    const newDeck: Deck = {
      id: deckId,
      name,
      level: project.decks.length + 1,
      rooms: [],
      corridors: [],
    }
    
    set({
      project: {
        ...project,
        decks: [...project.decks, newDeck],
      },
      activeDeckId: deckId,
      isDirty: true,
    })
    
    get().pushHistory()
  },

  removeDeck: (deckId: string) => {
    const { project, activeDeckId } = get()
    if (!project || project.decks.length <= 1) return
    
    const newDecks = project.decks.filter(d => d.id !== deckId)
    const newActiveDeckId = activeDeckId === deckId ? newDecks[0]?.id ?? null : activeDeckId
    
    set({
      project: {
        ...project,
        decks: newDecks,
      },
      activeDeckId: newActiveDeckId,
      isDirty: true,
    })
    
    get().pushHistory()
  },

  setActiveDeck: (deckId: string) => {
    set({ activeDeckId: deckId })
  },

  // ========================================================================
  // Room Actions
  // ========================================================================

  addRoom: (room: Omit<Room, 'id'>) => {
    const { project, activeDeckId } = get()
    if (!project || !activeDeckId) return ''
    
    const roomId = uuid()
    const newRoom: Room = { ...room, id: roomId }
    
    set({
      project: {
        ...project,
        decks: project.decks.map(deck => 
          deck.id === activeDeckId
            ? { ...deck, rooms: [...deck.rooms, newRoom] }
            : deck
        ),
      },
      isDirty: true,
    })
    
    get().pushHistory()
    return roomId
  },

  updateRoom: (roomId: string, updates: Partial<Room>) => {
    const { project, activeDeckId } = get()
    if (!project || !activeDeckId) return
    
    set({
      project: {
        ...project,
        decks: project.decks.map(deck => 
          deck.id === activeDeckId
            ? {
                ...deck,
                rooms: deck.rooms.map(room =>
                  room.id === roomId ? { ...room, ...updates } : room
                ),
              }
            : deck
        ),
      },
      isDirty: true,
    })
    
    get().pushHistory()
  },

  removeRoom: (roomId: string) => {
    const { project, activeDeckId } = get()
    if (!project || !activeDeckId) return
    
    set({
      project: {
        ...project,
        decks: project.decks.map(deck => 
          deck.id === activeDeckId
            ? { ...deck, rooms: deck.rooms.filter(r => r.id !== roomId) }
            : deck
        ),
      },
      isDirty: true,
    })
    
    get().pushHistory()
  },

  // ========================================================================
  // Corridor Actions
  // ========================================================================

  addCorridor: (corridor: Omit<Corridor, 'id'>) => {
    const { project, activeDeckId } = get()
    if (!project || !activeDeckId) return ''
    
    const corridorId = uuid()
    const newCorridor: Corridor = { ...corridor, id: corridorId }
    
    set({
      project: {
        ...project,
        decks: project.decks.map(deck => 
          deck.id === activeDeckId
            ? { ...deck, corridors: [...deck.corridors, newCorridor] }
            : deck
        ),
      },
      isDirty: true,
    })
    
    get().pushHistory()
    return corridorId
  },

  updateCorridor: (corridorId: string, updates: Partial<Corridor>) => {
    const { project, activeDeckId } = get()
    if (!project || !activeDeckId) return
    
    set({
      project: {
        ...project,
        decks: project.decks.map(deck => 
          deck.id === activeDeckId
            ? {
                ...deck,
                corridors: deck.corridors.map(corridor =>
                  corridor.id === corridorId ? { ...corridor, ...updates } : corridor
                ),
              }
            : deck
        ),
      },
      isDirty: true,
    })
    
    get().pushHistory()
  },

  removeCorridor: (corridorId: string) => {
    const { project, activeDeckId } = get()
    if (!project || !activeDeckId) return
    
    set({
      project: {
        ...project,
        decks: project.decks.map(deck => 
          deck.id === activeDeckId
            ? { ...deck, corridors: deck.corridors.filter(c => c.id !== corridorId) }
            : deck
        ),
      },
      isDirty: true,
    })
    
    get().pushHistory()
  },

  // ========================================================================
  // Object Actions
  // ========================================================================

  addObject: (roomId: string, object: Omit<MapObject, 'id'>) => {
    const { project, activeDeckId } = get()
    if (!project || !activeDeckId) return ''
    
    const objectId = uuid()
    const newObject: MapObject = { ...object, id: objectId }
    
    set({
      project: {
        ...project,
        decks: project.decks.map(deck => 
          deck.id === activeDeckId
            ? {
                ...deck,
                rooms: deck.rooms.map(room =>
                  room.id === roomId
                    ? { ...room, objects: [...room.objects, newObject] }
                    : room
                ),
              }
            : deck
        ),
      },
      isDirty: true,
    })
    
    get().pushHistory()
    return objectId
  },

  updateObject: (roomId: string, objectId: string, updates: Partial<MapObject>) => {
    const { project, activeDeckId } = get()
    if (!project || !activeDeckId) return
    
    set({
      project: {
        ...project,
        decks: project.decks.map(deck => 
          deck.id === activeDeckId
            ? {
                ...deck,
                rooms: deck.rooms.map(room =>
                  room.id === roomId
                    ? {
                        ...room,
                        objects: room.objects.map(obj =>
                          obj.id === objectId ? { ...obj, ...updates } : obj
                        ),
                      }
                    : room
                ),
              }
            : deck
        ),
      },
      isDirty: true,
    })
    
    get().pushHistory()
  },

  removeObject: (roomId: string, objectId: string) => {
    const { project, activeDeckId } = get()
    if (!project || !activeDeckId) return
    
    set({
      project: {
        ...project,
        decks: project.decks.map(deck => 
          deck.id === activeDeckId
            ? {
                ...deck,
                rooms: deck.rooms.map(room =>
                  room.id === roomId
                    ? { ...room, objects: room.objects.filter(o => o.id !== objectId) }
                    : room
                ),
              }
            : deck
        ),
      },
      isDirty: true,
    })
    
    get().pushHistory()
  },

  // ========================================================================
  // Tool Actions
  // ========================================================================

  setActiveTool: (tool: EditorTool) => {
    set({ activeTool: tool })
  },

  setActiveRoomType: (type: RoomType) => {
    set({ activeRoomType: type })
  },

  // ========================================================================
  // Selection Actions
  // ========================================================================

  select: (type: Selection['type'], ids: string[]) => {
    set({ selection: { type, ids } })
  },

  clearSelection: () => {
    set({ selection: { type: null, ids: [] } })
  },

  setHovered: (id: string | null) => {
    set({ hoveredId: id })
  },

  // ========================================================================
  // Drawing Actions
  // ========================================================================

  startDrawing: (point: Point) => {
    const snappedPoint = get().snapPoint(point)
    set({
      isDrawing: true,
      drawStartPoint: snappedPoint,
      drawCurrentPoint: snappedPoint,
    })
  },

  updateDrawing: (point: Point) => {
    const snappedPoint = get().snapPoint(point)
    set({ drawCurrentPoint: snappedPoint })
  },

  finishDrawing: () => {
    const { drawStartPoint, drawCurrentPoint } = get()
    
    if (!drawStartPoint || !drawCurrentPoint) {
      set({
        isDrawing: false,
        drawStartPoint: null,
        drawCurrentPoint: null,
      })
      return null
    }
    
    const rect: Rect = {
      x: Math.min(drawStartPoint.x, drawCurrentPoint.x),
      y: Math.min(drawStartPoint.y, drawCurrentPoint.y),
      width: Math.abs(drawCurrentPoint.x - drawStartPoint.x),
      height: Math.abs(drawCurrentPoint.y - drawStartPoint.y),
    }
    
    set({
      isDrawing: false,
      drawStartPoint: null,
      drawCurrentPoint: null,
    })
    
    return rect
  },

  cancelDrawing: () => {
    set({
      isDrawing: false,
      drawStartPoint: null,
      drawCurrentPoint: null,
    })
  },

  // ========================================================================
  // Viewport Actions
  // ========================================================================

  setViewport: (viewportUpdate: Partial<Viewport>) => {
    const { viewport } = get()
    set({ viewport: { ...viewport, ...viewportUpdate } })
  },

  zoomIn: () => {
    const { viewport } = get()
    set({ viewport: { ...viewport, zoom: Math.min(viewport.zoom * 1.2, 5) } })
  },

  zoomOut: () => {
    const { viewport } = get()
    set({ viewport: { ...viewport, zoom: Math.max(viewport.zoom / 1.2, 0.1) } })
  },

  resetViewport: () => {
    set({ viewport: { x: 0, y: 0, zoom: 1 } })
  },

  // ========================================================================
  // Layer Actions
  // ========================================================================

  setLayerVisibility: (layerId: LayerType, visible: boolean) => {
    const { layers } = get()
    set({
      layers: layers.map(layer =>
        layer.id === layerId ? { ...layer, isVisible: visible } : layer
      ),
    })
  },

  setLayerLocked: (layerId: LayerType, locked: boolean) => {
    const { layers } = get()
    set({
      layers: layers.map(layer =>
        layer.id === layerId ? { ...layer, isLocked: locked } : layer
      ),
    })
  },

  setActiveLayer: (layerId: LayerType) => {
    set({ activeLayerId: layerId })
  },

  // ========================================================================
  // Theme Actions
  // ========================================================================

  setTheme: (themeId: MapThemeId) => {
    const theme = MAP_THEMES[themeId]
    if (theme) {
      set({ activeTheme: theme })
    }
  },

  // ========================================================================
  // Grid Actions
  // ========================================================================

  toggleGrid: () => {
    const { showGrid } = get()
    set({ showGrid: !showGrid })
  },

  toggleSnapToGrid: () => {
    const { snapToGrid } = get()
    set({ snapToGrid: !snapToGrid })
  },

  setGridSize: (size: number) => {
    set({ gridSize: Math.max(8, Math.min(128, size)) })
  },

  // ========================================================================
  // History Actions
  // ========================================================================

  pushHistory: () => {
    const { project, history, historyIndex } = get()
    if (!project) return
    
    // Truncate future history if we're not at the end
    const newHistory = historyIndex < history.length - 1
      ? history.slice(0, historyIndex + 1)
      : [...history]
    
    // Add current state to history
    newHistory.push({
      decks: JSON.parse(JSON.stringify(project.decks)),
      timestamp: Date.now(),
    })
    
    // Limit history size
    if (newHistory.length > 50) {
      newHistory.shift()
      set({
        history: newHistory,
        historyIndex: newHistory.length - 1,
      })
    } else {
      set({
        history: newHistory,
        historyIndex: newHistory.length - 1,
      })
    }
  },

  undo: () => {
    const { project, history, historyIndex } = get()
    if (historyIndex > 0 && project) {
      const newIndex = historyIndex - 1
      set({
        project: {
          ...project,
          decks: JSON.parse(JSON.stringify(history[newIndex].decks)),
        },
        historyIndex: newIndex,
        isDirty: true,
      })
    }
  },

  redo: () => {
    const { project, history, historyIndex } = get()
    if (historyIndex < history.length - 1 && project) {
      const newIndex = historyIndex + 1
      set({
        project: {
          ...project,
          decks: JSON.parse(JSON.stringify(history[newIndex].decks)),
        },
        historyIndex: newIndex,
        isDirty: true,
      })
    }
  },

  // ========================================================================
  // Utility Functions
  // ========================================================================

  getActiveDeck: () => {
    const { project, activeDeckId } = get()
    return project?.decks.find(d => d.id === activeDeckId) ?? null
  },

  snapPoint: (point: Point) => {
    const { snapToGrid, gridSize } = get()
    if (!snapToGrid) return point
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    }
  },
}))

// ============================================================================
// Selectors
// ============================================================================

export const selectActiveDeck = (state: EditorStore) => 
  state.project?.decks.find(d => d.id === state.activeDeckId) ?? null

export const selectRooms = (state: EditorStore) => 
  selectActiveDeck(state)?.rooms ?? []

export const selectCorridors = (state: EditorStore) => 
  selectActiveDeck(state)?.corridors ?? []

export const selectSelectedRooms = (state: EditorStore) => {
  if (state.selection.type !== 'room') return []
  const deck = selectActiveDeck(state)
  return deck?.rooms.filter(r => state.selection.ids.includes(r.id)) ?? []
}

export const selectCanUndo = (state: EditorStore) => 
  state.historyIndex > 0

export const selectCanRedo = (state: EditorStore) => 
  state.historyIndex < state.history.length - 1
