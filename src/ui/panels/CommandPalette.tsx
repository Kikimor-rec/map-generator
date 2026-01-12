import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useEditor, actions } from '@store/EditorContext'
import { EditorTool, RoomType, ROOM_TYPE_CONFIGS } from '@core/types'

interface Command {
  id: string
  label: string
  category: 'tool' | 'action' | 'view' | 'generate' | 'navigate' | 'room'
  icon: string
  shortcut?: string
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onOpenGenerate: () => void
  onOpenSnapshots: () => void
}

export function CommandPalette({ isOpen, onClose, onOpenGenerate, onOpenSnapshots }: CommandPaletteProps) {
  const { state, dispatch, rooms, corridors } = useEditor()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Define all available commands
  const allCommands = useMemo<Command[]>(() => {
    const commands: Command[] = [
      // Tools
      { id: 'tool-select', label: 'Select Tool', category: 'tool', icon: '🔲', shortcut: 'V', 
        action: () => dispatch(actions.setActiveTool(EditorTool.Select)) },
      { id: 'tool-room', label: 'Room Tool', category: 'tool', icon: '📦', shortcut: 'R', 
        action: () => dispatch(actions.setActiveTool(EditorTool.Room)) },
      { id: 'tool-corridor', label: 'Corridor Tool', category: 'tool', icon: '🔗', shortcut: 'C', 
        action: () => dispatch(actions.setActiveTool(EditorTool.Corridor)) },
      { id: 'tool-door', label: 'Door Tool', category: 'tool', icon: '🚪', shortcut: 'D', 
        action: () => dispatch(actions.setActiveTool(EditorTool.Door)) },
      { id: 'tool-eraser', label: 'Eraser Tool', category: 'tool', icon: '🧹', shortcut: 'E', 
        action: () => dispatch(actions.setActiveTool(EditorTool.Eraser)) },
      
      // Actions
      { id: 'action-undo', label: 'Undo', category: 'action', icon: '↩️', shortcut: 'Ctrl+Z', 
        action: () => dispatch(actions.undo()) },
      { id: 'action-redo', label: 'Redo', category: 'action', icon: '↪️', shortcut: 'Ctrl+Y', 
        action: () => dispatch(actions.redo()) },
      { id: 'action-delete', label: 'Delete Selection', category: 'action', icon: '🗑️', shortcut: 'Del', 
        action: () => {
          if (state.selection.type === 'room') dispatch(actions.deleteRooms(state.selection.ids))
          else if (state.selection.type === 'corridor') dispatch(actions.deleteCorridors(state.selection.ids))
          dispatch(actions.clearSelection())
        }},
      { id: 'action-select-all', label: 'Select All Rooms', category: 'action', icon: '⬜', shortcut: 'Ctrl+A', 
        action: () => dispatch(actions.select({ type: 'room', ids: rooms.map(r => r.id) })) },
      { id: 'action-clear-selection', label: 'Clear Selection', category: 'action', icon: '❌', shortcut: 'Esc', 
        action: () => dispatch(actions.clearSelection()) },
      
      // View
      { id: 'view-zoom-in', label: 'Zoom In', category: 'view', icon: '🔍', shortcut: '+', 
        action: () => dispatch(actions.zoomIn()) },
      { id: 'view-zoom-out', label: 'Zoom Out', category: 'view', icon: '🔍', shortcut: '-', 
        action: () => dispatch(actions.zoomOut()) },
      { id: 'view-reset', label: 'Reset View', category: 'view', icon: '🔄', 
        action: () => dispatch(actions.resetViewport()) },
      { id: 'view-toggle-grid', label: 'Toggle Grid', category: 'view', icon: '📐', shortcut: 'G', 
        action: () => dispatch(actions.toggleGrid()) },
      
      // Generate
      { id: 'generate-map', label: 'Generate New Map', category: 'generate', icon: '🚀', 
        action: () => { onClose(); onOpenGenerate() }},
      { id: 'generate-snapshots', label: 'Open Snapshots', category: 'generate', icon: '📸', 
        action: () => { onClose(); onOpenSnapshots() }},
      
      // Quick room type selection
      ...Object.entries(ROOM_TYPE_CONFIGS).slice(0, 15).map(([type, config]) => ({
        id: `room-type-${type}`,
        label: `Set Room Type: ${config.name}`,
        category: 'room' as const,
        icon: config.icon,
        action: () => dispatch(actions.setActiveRoomType(type as RoomType))
      })),
    ]
    
    // Add navigation to specific rooms
    rooms.slice(0, 10).forEach(room => {
      const config = ROOM_TYPE_CONFIGS[room.type]
      commands.push({
        id: `goto-room-${room.id}`,
        label: `Go to: ${room.name || config.name}`,
        category: 'navigate',
        icon: config.icon,
        action: () => {
          dispatch(actions.select({ type: 'room', ids: [room.id] }))
          // Center view on room
          dispatch(actions.setViewport({
            x: -(room.bounds.x + room.bounds.width / 2) * state.viewport.zoom + 400,
            y: -(room.bounds.y + room.bounds.height / 2) * state.viewport.zoom + 300,
            zoom: state.viewport.zoom
          }))
        }
      })
    })
    
    return commands
  }, [dispatch, rooms, state.selection, state.viewport, onClose, onOpenGenerate, onOpenSnapshots])
  
  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return allCommands.slice(0, 15) // Show first 15 when no query
    
    const lowerQuery = query.toLowerCase()
    return allCommands.filter(cmd => 
      cmd.label.toLowerCase().includes(lowerQuery) ||
      cmd.category.toLowerCase().includes(lowerQuery)
    ).slice(0, 15)
  }, [allCommands, query])
  
  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredCommands.length])
  
  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setQuery('')
      setSelectedIndex(0)
    }
  }, [isOpen])
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action()
        onClose()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [filteredCommands, selectedIndex, onClose])
  
  const executeCommand = useCallback((cmd: Command) => {
    cmd.action()
    onClose()
  }, [onClose])
  
  if (!isOpen) return null
  
  const categoryColors: Record<string, string> = {
    tool: 'bg-cyber-blue/20 text-cyber-blue',
    action: 'bg-cyber-green/20 text-cyber-green',
    view: 'bg-cyber-purple/20 text-purple-400',
    generate: 'bg-cyber-orange/20 text-cyber-orange',
    navigate: 'bg-cyber-pink/20 text-pink-400',
    room: 'bg-space-600 text-space-300',
  }
  
  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-20 z-50" onClick={onClose}>
      <div 
        className="bg-space-900 border border-space-600 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="p-3 border-b border-space-700">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="w-full bg-space-800 border border-space-600 rounded px-3 py-2 text-white placeholder-space-400 focus:outline-none focus:border-cyber-blue"
            autoFocus
          />
        </div>
        
        {/* Command list */}
        <div className="max-h-80 overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="p-4 text-center text-space-400">
              No commands found
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <div
                key={cmd.id}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                  index === selectedIndex 
                    ? 'bg-space-700' 
                    : 'hover:bg-space-800'
                }`}
                onClick={() => executeCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="text-lg w-6 text-center">{cmd.icon}</span>
                <span className="flex-1 text-white">{cmd.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${categoryColors[cmd.category]}`}>
                  {cmd.category}
                </span>
                {cmd.shortcut && (
                  <span className="text-xs text-space-400 bg-space-700 px-2 py-0.5 rounded">
                    {cmd.shortcut}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        
        {/* Footer hint */}
        <div className="p-2 border-t border-space-700 text-xs text-space-400 flex justify-between">
          <span>↑↓ Navigate</span>
          <span>Enter Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  )
}
