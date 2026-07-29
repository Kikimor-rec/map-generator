import { useEffect, useCallback } from 'react'
import { MapCanvas } from '@ui/canvas'
import { Toolbar, TopBar, RightPanel, DeckTabs, StatusBar } from '@ui/panels'
import { useEditor, actions } from '@store/EditorContext'
import { EditorTool, type Room, type Corridor } from '@core/types'

// Clipboard for copy/paste (module-level to persist across renders)
let clipboard: {
  type: 'room' | 'corridor' | null
  items: Array<Room | Corridor>
} = { type: null, items: [] }

const TOOL_HINTS: Partial<Record<EditorTool, string>> = {
  [EditorTool.Select]: 'Select: drag to move; Alt temporarily inverts attachment preservation',
  [EditorTool.Room]: 'Room: drag on the canvas to create a room',
  [EditorTool.Corridor]: 'Hallway: click points to draw, right-click or Escape to finish',
  [EditorTool.Door]: 'Door: click a room edge',
  [EditorTool.Text]: 'Label: click to place text',
  [EditorTool.Icon]: 'Marker: click to place a marker',
  [EditorTool.Pan]: 'Pan: drag the canvas',
}

export function EditorLayout() {
  const { state, dispatch } = useEditor()

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Escape - clear selection, cancel operations
      if (e.key === 'Escape') {
        dispatch(actions.clearSelection())
        return
      }

      // Delete/Backspace - delete selected objects
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const selection = state.selection
        if (selection.ids.length > 0) {
          if (selection.type === 'room') {
            dispatch(actions.deleteRooms(selection.ids))
          } else if (selection.type === 'corridor') {
            dispatch(actions.deleteCorridors(selection.ids))
          }
          dispatch(actions.clearSelection())
          dispatch(actions.pushHistory())
        }
        return
      }

      // Arrow keys - nudge selected objects (Shift = 10x faster)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const selection = state.selection
        if (selection.ids.length > 0 && state.project) {
          const step = e.shiftKey ? 40 : 4 // Shift = 10x movement
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
          
          if (selection.type === 'room') {
            // Move selected rooms
            const rooms = state.project.decks
              .flatMap((d: { rooms: Room[] }) => d.rooms)
              .filter((r: Room) => selection.ids.includes(r.id))
            
            for (const room of rooms) {
              dispatch(actions.updateRoom(room.id, {
                bounds: {
                  ...room.bounds,
                  x: room.bounds.x + dx,
                  y: room.bounds.y + dy,
                },
              }))
            }
            dispatch(actions.pushHistory())
          } else if (selection.type === 'corridor') {
            // Move selected corridors
            const corridors = state.project.decks
              .flatMap((d: { corridors: Corridor[] }) => d.corridors)
              .filter((c: Corridor) => selection.ids.includes(c.id))
            
            for (const corridor of corridors) {
              dispatch(actions.updateCorridor(corridor.id, {
                segments: corridor.segments.map(s => ({
                  start: { x: s.start.x + dx, y: s.start.y + dy },
                  end: { x: s.end.x + dx, y: s.end.y + dy },
                })),
              }))
            }
            dispatch(actions.pushHistory())
          }
        }
        return
      }

      // Undo/Redo
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+S - Save to localStorage
        if (e.key === 's') {
          e.preventDefault()
          if (state.project) {
            try {
              const saveData = {
                project: state.project,
                activeDeckId: state.activeDeckId,
                savedAt: new Date().toISOString(),
              }
              localStorage.setItem('scifi-map-autosave', JSON.stringify(saveData))
              console.log('Project saved manually at', saveData.savedAt)
              // Could add a toast notification here
            } catch (err) {
              console.error('Failed to save:', err)
            }
          }
          return
        }

        // Ctrl+A - Select all (based on active tool or available items)
        if (e.key === 'a') {
          e.preventDefault()
          if (!state.project || !state.activeDeckId) {
            return
          }

          const activeDeck = state.project.decks.find(deck => deck.id === state.activeDeckId)
          if (!activeDeck) {
            return
          }

          const roomIds = activeDeck.rooms.map(room => room.id)
          const corridorIds = activeDeck.corridors.map(corridor => corridor.id)

          if (state.activeTool === EditorTool.Corridor) {
            if (corridorIds.length > 0) {
              dispatch(actions.select({ type: 'corridor', ids: corridorIds }))
            }
            return
          }

          if (state.activeTool === EditorTool.Room) {
            if (roomIds.length > 0) {
              dispatch(actions.select({ type: 'room', ids: roomIds }))
            }
            return
          }

          if (roomIds.length > 0) {
            dispatch(actions.select({ type: 'room', ids: roomIds }))
          } else if (corridorIds.length > 0) {
            dispatch(actions.select({ type: 'corridor', ids: corridorIds }))
          }
          return
        }
        
        if (e.key === 'z') {
          e.preventDefault()
          if (e.shiftKey) {
            dispatch(actions.redo())
          } else {
            dispatch(actions.undo())
          }
          return
        }
        if (e.key === 'y') {
          e.preventDefault()
          dispatch(actions.redo())
          return
        }
        // Ctrl+D - Duplicate
        if (e.key === 'd') {
          e.preventDefault()
          const selection = state.selection
          if (selection.ids.length > 0 && selection.type === 'room' && state.project) {
            // Duplicate rooms with offset
            const rooms = state.project.decks
              .flatMap((d: { rooms: any[] }) => d.rooms)
              .filter((r: { id: string }) => selection.ids.includes(r.id))
            
            for (const room of rooms) {
              dispatch(actions.addRoom({
                type: room.type,
                name: room.name + ' (copy)',
                bounds: {
                  x: room.bounds.x + 40,
                  y: room.bounds.y + 40,
                  width: room.bounds.width,
                  height: room.bounds.height,
                },
                color: room.color,
                borderColor: room.borderColor,
                doors: [],
                objects: [],
                metadata: { ...room.metadata },
                deckLevel: room.deckLevel,
                isVisible: true,
                isLocked: false,
              }))
            }
            dispatch(actions.pushHistory())
          }
          return
        }
        
        // Ctrl+C - Copy
        if (e.key === 'c') {
          e.preventDefault()
          const selection = state.selection
          if (selection.ids.length > 0 && state.project) {
            if (selection.type === 'room') {
              const rooms = state.project.decks
                .flatMap((d: { rooms: Room[] }) => d.rooms)
                .filter((r: Room) => selection.ids.includes(r.id))
              clipboard = { type: 'room', items: rooms.map((r: Room) => ({ ...r })) }
              console.log('Copied', rooms.length, 'rooms')
            } else if (selection.type === 'corridor') {
              const corridors = state.project.decks
                .flatMap((d: { corridors: Corridor[] }) => d.corridors)
                .filter((c: Corridor) => selection.ids.includes(c.id))
              clipboard = { type: 'corridor', items: corridors.map((c: Corridor) => ({ ...c })) }
              console.log('Copied', corridors.length, 'corridors')
            }
          }
          return
        }
        
        // Ctrl+V - Paste
        if (e.key === 'v') {
          e.preventDefault()
          if (clipboard.items.length > 0) {
            const offset = 40 // Offset pasted items
            
            if (clipboard.type === 'room') {
              const newIds: string[] = []
              for (const item of clipboard.items) {
                const room = item as Room
                const newId = crypto.randomUUID()
                newIds.push(newId)
                dispatch(actions.addRoom({
                  type: room.type,
                  name: room.name + ' (copy)',
                  bounds: {
                    x: room.bounds.x + offset,
                    y: room.bounds.y + offset,
                    width: room.bounds.width,
                    height: room.bounds.height,
                  },
                  color: room.color,
                  borderColor: room.borderColor,
                  doors: [],
                  objects: [],
                  metadata: { ...room.metadata },
                  deckLevel: room.deckLevel,
                  isVisible: true,
                  isLocked: false,
                }))
              }
              dispatch(actions.pushHistory())
              console.log('Pasted', clipboard.items.length, 'rooms')
            } else if (clipboard.type === 'corridor') {
              for (const item of clipboard.items) {
                const corridor = item as Corridor
                dispatch(actions.addCorridor({
                  segments: corridor.segments.map(s => ({
                    start: { x: s.start.x + offset, y: s.start.y + offset },
                    end: { x: s.end.x + offset, y: s.end.y + offset },
                  })),
                  width: corridor.width,
                  style: corridor.style,
                  color: corridor.color,
                  doors: [],
                  connectedRoomIds: [],
                  deckLevel: 1,
                }))
              }
              dispatch(actions.pushHistory())
              console.log('Pasted', clipboard.items.length, 'corridors')
            }
          }
          return
        }
      }

      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            dispatch(actions.setActiveTool(EditorTool.Select))
            break
          case 'h':
            dispatch(actions.setActiveTool(EditorTool.Pan))
            break
          case 'r':
            dispatch(actions.setActiveTool(EditorTool.Room))
            break
          case 'c':
            dispatch(actions.setActiveTool(EditorTool.Corridor))
            break
          case 'd':
            dispatch(actions.setActiveTool(EditorTool.Door))
            break
          case 'o':
            dispatch(actions.setActiveTool(EditorTool.Object))
            break
          case 'e':
            dispatch(actions.setActiveTool(EditorTool.Eraser))
            break
          case 'a':
            dispatch(actions.setActiveTool(EditorTool.Annotate))
            break
          case 't':
            dispatch(actions.setActiveTool(EditorTool.Text))
            break
          case 'i':
            dispatch(actions.setActiveTool(EditorTool.Icon))
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dispatch, state.selection, state.project, state.activeDeckId, state.activeTool])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-space-900">
      {/* Top bar */}
      <TopBar />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left toolbar */}
        <Toolbar />

        {/* Center - Canvas and deck tabs */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Deck tabs */}
          <DeckTabs />

          <div className="px-3 py-1.5 border-b border-space-700 bg-space-850 text-xs text-space-400 flex items-center justify-between">
            <span>{TOOL_HINTS[state.activeTool] ?? 'Ready'}</span>
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${state.preserveAttachments ? 'bg-cyber-400' : 'bg-space-500'}`}
                aria-hidden="true"
              />
              Attachments: {state.preserveAttachments ? 'preserve' : 'free'}
              <span className="text-space-500">Alt = invert</span>
            </span>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-hidden relative">
            <MapCanvas />
          </div>
        </div>

        {/* Right panel */}
        <RightPanel />
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  )
}
