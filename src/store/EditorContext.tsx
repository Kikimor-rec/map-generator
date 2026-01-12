import React, { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import {
  type MapProject,
  type Deck,
  type Room,
  type Corridor,
  type MapObject,
  type Layer,
  type MapTheme,
  type Point,
  type Selection,
  EditorTool,
  RoomType,
  LayerType,
  MapThemeId,
  MAP_THEMES,
  DEFAULT_LAYERS,
} from '@core/types'

// ============================================================================
// State Types
// ============================================================================

export interface Snapshot {
  id: string
  name: string
  decks: Deck[]
  createdAt: string
  thumbnail?: string
}

interface HistoryEntry {
  decks: Deck[]
  timestamp: number
}

interface EditorState {
  // Project
  project: MapProject | null
  activeDeckId: string | null
  isDirty: boolean

  // Editor state
  activeTool: EditorTool
  activeRoomType: RoomType
  selection: Selection
  hoveredId: string | null

  // Drawing state
  isDrawing: boolean
  drawStartPoint: Point | null
  drawCurrentPoint: Point | null

  // Viewport
  viewport: { x: number; y: number; zoom: number }

  // Settings
  layers: Layer[]
  activeLayerId: LayerType
  activeTheme: MapTheme
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number

  // History
  history: HistoryEntry[]
  historyIndex: number

  // Snapshots
  snapshots: Snapshot[]
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: EditorState = {
  project: null,
  activeDeckId: null,
  isDirty: false,
  activeTool: EditorTool.Select,
  activeRoomType: RoomType.Bridge,
  selection: { type: null, ids: [] },
  hoveredId: null,
  isDrawing: false,
  drawStartPoint: null,
  drawCurrentPoint: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  layers: [...DEFAULT_LAYERS],
  activeLayerId: LayerType.Structure,
  activeTheme: MAP_THEMES[MapThemeId.Blueprint],
  showGrid: true,
  snapToGrid: true,
  gridSize: 32,
  history: [],
  historyIndex: -1,
  snapshots: [],
}

// ============================================================================
// Action Types
// ============================================================================

type EditorAction =
  | { type: 'NEW_PROJECT'; name: string }
  | { type: 'LOAD_PROJECT'; project: MapProject }
  | { type: 'SET_ACTIVE_DECK'; deckId: string }
  | { type: 'ADD_DECK'; name: string }
  | { type: 'RENAME_DECK'; deckId: string; name: string }
  | { type: 'DELETE_DECK'; deckId: string }
  | { type: 'ADD_ROOM'; room: Omit<Room, 'id'> }
  | { type: 'UPDATE_ROOM'; roomId: string; updates: Partial<Room> }
  | { type: 'DELETE_ROOMS'; roomIds: string[] }
  | { type: 'ADD_CORRIDOR'; corridor: Omit<Corridor, 'id'> }
  | { type: 'UPDATE_CORRIDOR'; corridorId: string; updates: Partial<Corridor> }
  | { type: 'DELETE_CORRIDORS'; corridorIds: string[] }
  | { type: 'ADD_OBJECT'; roomId: string; object: Omit<MapObject, 'id'> }
  | { type: 'UPDATE_OBJECT'; roomId: string; objectId: string; updates: Partial<MapObject> }
  | { type: 'DELETE_OBJECT'; roomId: string; objectId: string }
  | { type: 'SET_ACTIVE_TOOL'; tool: EditorTool }
  | { type: 'SET_ACTIVE_ROOM_TYPE'; roomType: RoomType }
  | { type: 'SELECT'; selection: Selection }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_HOVERED'; id: string | null }
  | { type: 'START_DRAWING'; point: Point }
  | { type: 'UPDATE_DRAWING'; point: Point }
  | { type: 'FINISH_DRAWING' }
  | { type: 'CANCEL_DRAWING' }
  | { type: 'SET_VIEWPORT'; viewport: { x: number; y: number; zoom: number } }
  | { type: 'ZOOM_IN' }
  | { type: 'ZOOM_OUT' }
  | { type: 'RESET_VIEWPORT' }
  | { type: 'TOGGLE_GRID' }
  | { type: 'TOGGLE_SNAP_TO_GRID' }
  | { type: 'SET_GRID_SIZE'; size: number }
  | { type: 'SET_THEME'; themeId: MapThemeId }
  | { type: 'TOGGLE_LAYER'; layerId: LayerType }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'PUSH_HISTORY' }
  | { type: 'APPLY_GENERATED_MAP'; decks: Deck[] }
  | { type: 'CREATE_SNAPSHOT'; name: string; thumbnail?: string }
  | { type: 'RESTORE_SNAPSHOT'; snapshotId: string }
  | { type: 'DELETE_SNAPSHOT'; snapshotId: string }

// ============================================================================
// Reducer
// ============================================================================

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'NEW_PROJECT': {
      const projectId = uuid()
      const deckId = uuid()
      const newProject: MapProject = {
        id: projectId,
        name: action.name,
        description: '',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        gridSize: 32,
        decks: [{
          id: deckId,
          name: 'Deck 1',
          level: 1,
          rooms: [],
          corridors: [],
        }],
        layers: [...DEFAULT_LAYERS],
        theme: MAP_THEMES[MapThemeId.Blueprint],
        metadata: {},
      }
      return {
        ...state,
        project: newProject,
        activeDeckId: deckId,
        isDirty: false,
        history: [{
          decks: JSON.parse(JSON.stringify(newProject.decks)),
          timestamp: Date.now(),
        }],
        historyIndex: 0,
      }
    }

    case 'LOAD_PROJECT': {
      return {
        ...state,
        project: action.project,
        activeDeckId: action.project.decks[0]?.id ?? null,
        layers: action.project.layers,
        activeTheme: action.project.theme,
        gridSize: action.project.gridSize,
        isDirty: false,
        history: [{
          decks: JSON.parse(JSON.stringify(action.project.decks)),
          timestamp: Date.now(),
        }],
        historyIndex: 0,
      }
    }

    case 'SET_ACTIVE_DECK': {
      return { ...state, activeDeckId: action.deckId }
    }

    case 'ADD_DECK': {
      if (!state.project) return state
      const newDeckId = uuid()
      const newDeck: Deck = {
        id: newDeckId,
        name: action.name,
        level: state.project.decks.length + 1,
        rooms: [],
        corridors: [],
      }
      return {
        ...state,
        project: {
          ...state.project,
          decks: [...state.project.decks, newDeck],
        },
        activeDeckId: newDeckId,
        isDirty: true,
      }
    }

    case 'RENAME_DECK': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          decks: state.project.decks.map(d =>
            d.id === action.deckId ? { ...d, name: action.name } : d
          ),
        },
        isDirty: true,
      }
    }

    case 'DELETE_DECK': {
      if (!state.project || state.project.decks.length <= 1) return state
      const newDecks = state.project.decks.filter(d => d.id !== action.deckId)
      return {
        ...state,
        project: {
          ...state.project,
          decks: newDecks,
        },
        activeDeckId: state.activeDeckId === action.deckId 
          ? newDecks[0]?.id ?? null 
          : state.activeDeckId,
        isDirty: true,
      }
    }

    case 'ADD_ROOM': {
      if (!state.project || !state.activeDeckId) return state
      const roomId = uuid()
      return {
        ...state,
        project: {
          ...state.project,
          decks: state.project.decks.map(d =>
            d.id === state.activeDeckId
              ? { ...d, rooms: [...d.rooms, { ...action.room, id: roomId }] }
              : d
          ),
        },
        isDirty: true,
      }
    }

    case 'UPDATE_ROOM': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          decks: state.project.decks.map(d =>
            d.id === state.activeDeckId
              ? {
                  ...d,
                  rooms: d.rooms.map(r =>
                    r.id === action.roomId ? { ...r, ...action.updates } : r
                  ),
                }
              : d
          ),
        },
        isDirty: true,
      }
    }

    case 'DELETE_ROOMS': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          decks: state.project.decks.map(d =>
            d.id === state.activeDeckId
              ? { ...d, rooms: d.rooms.filter(r => !action.roomIds.includes(r.id)) }
              : d
          ),
        },
        selection: { type: null, ids: [] },
        isDirty: true,
      }
    }

    case 'ADD_CORRIDOR': {
      if (!state.project || !state.activeDeckId) return state
      const corridorId = uuid()
      return {
        ...state,
        project: {
          ...state.project,
          decks: state.project.decks.map(d =>
            d.id === state.activeDeckId
              ? { ...d, corridors: [...d.corridors, { ...action.corridor, id: corridorId }] }
              : d
          ),
        },
        isDirty: true,
      }
    }

    case 'UPDATE_CORRIDOR': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          decks: state.project.decks.map(d =>
            d.id === state.activeDeckId
              ? {
                  ...d,
                  corridors: d.corridors.map(c =>
                    c.id === action.corridorId ? { ...c, ...action.updates } : c
                  ),
                }
              : d
          ),
        },
        isDirty: true,
      }
    }

    case 'DELETE_CORRIDORS': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          decks: state.project.decks.map(d =>
            d.id === state.activeDeckId
              ? { ...d, corridors: d.corridors.filter(c => !action.corridorIds.includes(c.id)) }
              : d
          ),
        },
        selection: { type: null, ids: [] },
        isDirty: true,
      }
    }

    case 'ADD_OBJECT': {
      if (!state.project) return state
      const objectId = uuid()
      return {
        ...state,
        project: {
          ...state.project,
          decks: state.project.decks.map(d =>
            d.id === state.activeDeckId
              ? {
                  ...d,
                  rooms: d.rooms.map(r =>
                    r.id === action.roomId
                      ? { ...r, objects: [...r.objects, { ...action.object, id: objectId }] }
                      : r
                  ),
                }
              : d
          ),
        },
        isDirty: true,
      }
    }

    case 'UPDATE_OBJECT': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          decks: state.project.decks.map(d =>
            d.id === state.activeDeckId
              ? {
                  ...d,
                  rooms: d.rooms.map(r =>
                    r.id === action.roomId
                      ? {
                          ...r,
                          objects: r.objects.map(o =>
                            o.id === action.objectId ? { ...o, ...action.updates } : o
                          ),
                        }
                      : r
                  ),
                }
              : d
          ),
        },
        isDirty: true,
      }
    }

    case 'DELETE_OBJECT': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          decks: state.project.decks.map(d =>
            d.id === state.activeDeckId
              ? {
                  ...d,
                  rooms: d.rooms.map(r =>
                    r.id === action.roomId
                      ? { ...r, objects: r.objects.filter(o => o.id !== action.objectId) }
                      : r
                  ),
                }
              : d
          ),
        },
        isDirty: true,
      }
    }

    case 'SET_ACTIVE_TOOL': {
      return { ...state, activeTool: action.tool }
    }

    case 'SET_ACTIVE_ROOM_TYPE': {
      return { ...state, activeRoomType: action.roomType }
    }

    case 'SELECT': {
      return { ...state, selection: action.selection }
    }

    case 'CLEAR_SELECTION': {
      return { ...state, selection: { type: null, ids: [] } }
    }

    case 'SET_HOVERED': {
      return { ...state, hoveredId: action.id }
    }

    case 'START_DRAWING': {
      const snappedPoint = state.snapToGrid
        ? {
            x: Math.round(action.point.x / state.gridSize) * state.gridSize,
            y: Math.round(action.point.y / state.gridSize) * state.gridSize,
          }
        : action.point
      return {
        ...state,
        isDrawing: true,
        drawStartPoint: snappedPoint,
        drawCurrentPoint: snappedPoint,
      }
    }

    case 'UPDATE_DRAWING': {
      if (!state.isDrawing) return state
      const snappedPoint = state.snapToGrid
        ? {
            x: Math.round(action.point.x / state.gridSize) * state.gridSize,
            y: Math.round(action.point.y / state.gridSize) * state.gridSize,
          }
        : action.point
      return { ...state, drawCurrentPoint: snappedPoint }
    }

    case 'FINISH_DRAWING': {
      return {
        ...state,
        isDrawing: false,
        drawStartPoint: null,
        drawCurrentPoint: null,
      }
    }

    case 'CANCEL_DRAWING': {
      return {
        ...state,
        isDrawing: false,
        drawStartPoint: null,
        drawCurrentPoint: null,
      }
    }

    case 'SET_VIEWPORT': {
      return { ...state, viewport: action.viewport }
    }

    case 'ZOOM_IN': {
      return {
        ...state,
        viewport: { ...state.viewport, zoom: Math.min(state.viewport.zoom * 1.2, 5) },
      }
    }

    case 'ZOOM_OUT': {
      return {
        ...state,
        viewport: { ...state.viewport, zoom: Math.max(state.viewport.zoom / 1.2, 0.1) },
      }
    }

    case 'RESET_VIEWPORT': {
      return { ...state, viewport: { x: 0, y: 0, zoom: 1 } }
    }

    case 'TOGGLE_GRID': {
      return { ...state, showGrid: !state.showGrid }
    }

    case 'TOGGLE_SNAP_TO_GRID': {
      return { ...state, snapToGrid: !state.snapToGrid }
    }

    case 'SET_GRID_SIZE': {
      return { ...state, gridSize: action.size }
    }

    case 'SET_THEME': {
      const theme = MAP_THEMES[action.themeId]
      if (!theme) return state
      return {
        ...state,
        activeTheme: theme,
        project: state.project ? { ...state.project, theme } : null,
      }
    }

    case 'TOGGLE_LAYER': {
      return {
        ...state,
        layers: state.layers.map(l =>
          l.id === action.layerId ? { ...l, isVisible: !l.isVisible } : l
        ),
      }
    }

    case 'PUSH_HISTORY': {
      if (!state.project) return state
      const newHistory = state.historyIndex < state.history.length - 1
        ? state.history.slice(0, state.historyIndex + 1)
        : [...state.history]
      
      newHistory.push({
        decks: JSON.parse(JSON.stringify(state.project.decks)),
        timestamp: Date.now(),
      })

      // Limit history size
      if (newHistory.length > 50) {
        newHistory.shift()
      }

      return {
        ...state,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      }
    }

    case 'UNDO': {
      if (state.historyIndex <= 0 || !state.project) return state
      const newIndex = state.historyIndex - 1
      return {
        ...state,
        project: {
          ...state.project,
          decks: JSON.parse(JSON.stringify(state.history[newIndex].decks)),
        },
        historyIndex: newIndex,
        isDirty: true,
      }
    }

    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1 || !state.project) return state
      const newIndex = state.historyIndex + 1
      return {
        ...state,
        project: {
          ...state.project,
          decks: JSON.parse(JSON.stringify(state.history[newIndex].decks)),
        },
        historyIndex: newIndex,
        isDirty: true,
      }
    }

    case 'APPLY_GENERATED_MAP': {
      if (!state.project) return state
      return {
        ...state,
        project: {
          ...state.project,
          decks: action.decks,
        },
        activeDeckId: action.decks[0]?.id ?? state.activeDeckId,
        isDirty: true,
      }
    }

    case 'CREATE_SNAPSHOT': {
      if (!state.project) return state
      const snapshot: Snapshot = {
        id: uuid(),
        name: action.name,
        decks: JSON.parse(JSON.stringify(state.project.decks)),
        createdAt: new Date().toISOString(),
        thumbnail: action.thumbnail,
      }
      return {
        ...state,
        snapshots: [...state.snapshots, snapshot],
      }
    }

    case 'RESTORE_SNAPSHOT': {
      if (!state.project) return state
      const snapshot = state.snapshots.find(s => s.id === action.snapshotId)
      if (!snapshot) return state
      return {
        ...state,
        project: {
          ...state.project,
          decks: JSON.parse(JSON.stringify(snapshot.decks)),
        },
        activeDeckId: snapshot.decks[0]?.id ?? state.activeDeckId,
        isDirty: true,
      }
    }

    case 'DELETE_SNAPSHOT': {
      return {
        ...state,
        snapshots: state.snapshots.filter(s => s.id !== action.snapshotId),
      }
    }

    default:
      return state
  }
}

// ============================================================================
// Context
// ============================================================================

interface EditorContextValue {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
  // Convenience selectors
  activeDeck: Deck | null
  rooms: Room[]
  corridors: Corridor[]
  junctions: import('@core/types').CorridorJunction[]
  lineJumps: import('@core/types').CorridorLineJump[]
  canUndo: boolean
  canRedo: boolean
}

const EditorContext = createContext<EditorContextValue | null>(null)

// ============================================================================
// Provider
// ============================================================================

const AUTOSAVE_KEY = 'scifi-map-autosave'
const AUTOSAVE_DELAY = 2000 // 2 seconds debounce

export function EditorProvider({ children }: { children: ReactNode }) {
  // Load initial state from localStorage if available
  const loadedState = React.useMemo(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.project) {
          return {
            ...initialState,
            project: parsed.project,
            activeDeckId: parsed.activeDeckId || parsed.project.decks[0]?.id || null,
            isDirty: false, // Not dirty on load
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load autosave:', e)
    }
    return initialState
  }, [])

  const [state, dispatch] = useReducer(editorReducer, loadedState)

  // Auto-save to localStorage when project changes
  useEffect(() => {
    if (!state.project) return

    const timeoutId = setTimeout(() => {
      try {
        const saveData = {
          project: state.project,
          activeDeckId: state.activeDeckId,
          savedAt: new Date().toISOString(),
        }
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(saveData))
        console.log('Auto-saved project at', saveData.savedAt)
      } catch (e) {
        console.warn('Failed to auto-save:', e)
      }
    }, AUTOSAVE_DELAY)

    return () => clearTimeout(timeoutId)
  }, [state.project, state.activeDeckId])

  // Computed values
  const activeDeck = state.project?.decks.find(d => d.id === state.activeDeckId) ?? null
  const rooms = activeDeck?.rooms ?? []
  const corridors = activeDeck?.corridors ?? []
  const junctions = activeDeck?.junctions ?? []
  const lineJumps = activeDeck?.lineJumps ?? []
  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1

  const value: EditorContextValue = {
    state,
    dispatch,
    activeDeck,
    rooms,
    corridors,
    junctions,
    lineJumps,
    canUndo,
    canRedo,
  }

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  )
}

// ============================================================================
// Hook
// ============================================================================

export function useEditor() {
  const context = useContext(EditorContext)
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider')
  }
  return context
}

// ============================================================================
// Action Creators (convenience functions)
// ============================================================================

export const actions = {
  newProject: (name: string): EditorAction => ({ type: 'NEW_PROJECT', name }),
  loadProject: (project: MapProject): EditorAction => ({ type: 'LOAD_PROJECT', project }),
  setActiveDeck: (deckId: string): EditorAction => ({ type: 'SET_ACTIVE_DECK', deckId }),
  addDeck: (name: string): EditorAction => ({ type: 'ADD_DECK', name }),
  renameDeck: (deckId: string, name: string): EditorAction => ({ type: 'RENAME_DECK', deckId, name }),
  deleteDeck: (deckId: string): EditorAction => ({ type: 'DELETE_DECK', deckId }),
  addRoom: (room: Omit<Room, 'id'>): EditorAction => ({ type: 'ADD_ROOM', room }),
  updateRoom: (roomId: string, updates: Partial<Room>): EditorAction => ({ type: 'UPDATE_ROOM', roomId, updates }),
  deleteRooms: (roomIds: string[]): EditorAction => ({ type: 'DELETE_ROOMS', roomIds }),
  addCorridor: (corridor: Omit<Corridor, 'id'>): EditorAction => ({ type: 'ADD_CORRIDOR', corridor }),
  updateCorridor: (corridorId: string, updates: Partial<Corridor>): EditorAction => ({ type: 'UPDATE_CORRIDOR', corridorId, updates }),
  deleteCorridors: (corridorIds: string[]): EditorAction => ({ type: 'DELETE_CORRIDORS', corridorIds }),
  addObject: (roomId: string, object: Omit<MapObject, 'id'>): EditorAction => ({ type: 'ADD_OBJECT', roomId, object }),
  updateObject: (roomId: string, objectId: string, updates: Partial<MapObject>): EditorAction => ({ type: 'UPDATE_OBJECT', roomId, objectId, updates }),
  deleteObject: (roomId: string, objectId: string): EditorAction => ({ type: 'DELETE_OBJECT', roomId, objectId }),
  setActiveTool: (tool: EditorTool): EditorAction => ({ type: 'SET_ACTIVE_TOOL', tool }),
  setActiveRoomType: (roomType: RoomType): EditorAction => ({ type: 'SET_ACTIVE_ROOM_TYPE', roomType }),
  select: (selection: Selection): EditorAction => ({ type: 'SELECT', selection }),
  clearSelection: (): EditorAction => ({ type: 'CLEAR_SELECTION' }),
  setHovered: (id: string | null): EditorAction => ({ type: 'SET_HOVERED', id }),
  startDrawing: (point: Point): EditorAction => ({ type: 'START_DRAWING', point }),
  updateDrawing: (point: Point): EditorAction => ({ type: 'UPDATE_DRAWING', point }),
  finishDrawing: (): EditorAction => ({ type: 'FINISH_DRAWING' }),
  cancelDrawing: (): EditorAction => ({ type: 'CANCEL_DRAWING' }),
  setViewport: (viewport: { x: number; y: number; zoom: number }): EditorAction => ({ type: 'SET_VIEWPORT', viewport }),
  zoomIn: (): EditorAction => ({ type: 'ZOOM_IN' }),
  zoomOut: (): EditorAction => ({ type: 'ZOOM_OUT' }),
  resetViewport: (): EditorAction => ({ type: 'RESET_VIEWPORT' }),
  toggleGrid: (): EditorAction => ({ type: 'TOGGLE_GRID' }),
  toggleSnapToGrid: (): EditorAction => ({ type: 'TOGGLE_SNAP_TO_GRID' }),
  setGridSize: (size: number): EditorAction => ({ type: 'SET_GRID_SIZE', size }),
  setTheme: (themeId: MapThemeId): EditorAction => ({ type: 'SET_THEME', themeId }),
  toggleLayer: (layerId: LayerType): EditorAction => ({ type: 'TOGGLE_LAYER', layerId }),
  undo: (): EditorAction => ({ type: 'UNDO' }),
  redo: (): EditorAction => ({ type: 'REDO' }),
  pushHistory: (): EditorAction => ({ type: 'PUSH_HISTORY' }),
  applyGeneratedMap: (decks: Deck[]): EditorAction => ({ type: 'APPLY_GENERATED_MAP', decks }),
  createSnapshot: (name: string, thumbnail?: string): EditorAction => ({ type: 'CREATE_SNAPSHOT', name, thumbnail }),
  restoreSnapshot: (snapshotId: string): EditorAction => ({ type: 'RESTORE_SNAPSHOT', snapshotId }),
  deleteSnapshot: (snapshotId: string): EditorAction => ({ type: 'DELETE_SNAPSHOT', snapshotId }),
}
