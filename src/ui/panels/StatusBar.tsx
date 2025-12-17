import { useEditor, actions } from '@store/EditorContext'

export function StatusBar() {
  const { state, dispatch, rooms, corridors } = useEditor()
  const { viewport, activeTool, gridSize, isDrawing, drawStartPoint, drawCurrentPoint, selection } = state

  const getToolHint = () => {
    switch (activeTool) {
      case 'select':
        return 'Click to select • Drag to move • Delete to remove'
      case 'pan':
        return 'Drag to pan • Scroll to zoom'
      case 'room':
        return 'Click and drag to create room • Esc to cancel'
      case 'corridor':
        return 'Click to start • Click to end • Esc to cancel'
      case 'door':
        return 'Click on wall to place door'
      case 'object':
        return 'Click to place object'
      case 'eraser':
        return 'Click to delete elements'
      case 'annotate':
        return 'Click to add annotation'
      default:
        return ''
    }
  }

  const getDrawingInfo = () => {
    if (!isDrawing || !drawStartPoint || !drawCurrentPoint) return null
    
    const width = Math.abs(drawCurrentPoint.x - drawStartPoint.x)
    const height = Math.abs(drawCurrentPoint.y - drawStartPoint.y)
    const cellsW = Math.round(width / gridSize)
    const cellsH = Math.round(height / gridSize)
    
    return `${cellsW} × ${cellsH} cells (${Math.round(width)} × ${Math.round(height)} px)`
  }

  const handleZoom100 = () => {
    dispatch(actions.setViewport({
      x: viewport.x,
      y: viewport.y,
      zoom: 1,
    }))
  }

  const handleCenterOnSelection = () => {
    if (selection.ids.length === 0) return
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    
    if (selection.type === 'room') {
      for (const room of rooms) {
        if (selection.ids.includes(room.id)) {
          minX = Math.min(minX, room.bounds.x)
          minY = Math.min(minY, room.bounds.y)
          maxX = Math.max(maxX, room.bounds.x + room.bounds.width)
          maxY = Math.max(maxY, room.bounds.y + room.bounds.height)
        }
      }
    } else if (selection.type === 'corridor') {
      for (const corridor of corridors) {
        if (selection.ids.includes(corridor.id)) {
          for (const segment of corridor.segments) {
            minX = Math.min(minX, segment.start.x, segment.end.x)
            minY = Math.min(minY, segment.start.y, segment.end.y)
            maxX = Math.max(maxX, segment.start.x, segment.end.x)
            maxY = Math.max(maxY, segment.start.y, segment.end.y)
          }
        }
      }
    }
    
    if (minX === Infinity) return
    
    // Calculate center of selection
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    
    // Center viewport on selection (assuming canvas is roughly 800x600)
    dispatch(actions.setViewport({
      x: -centerX * viewport.zoom + 400,
      y: -centerY * viewport.zoom + 300,
      zoom: viewport.zoom,
    }))
  }

  const drawingInfo = getDrawingInfo()

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-space-900 border-t border-space-700 text-xs">
      {/* Left - Tool hint */}
      <div className="text-space-400">
        {getToolHint()}
      </div>

      {/* Center - Drawing info */}
      <div className="text-cyber-blue">
        {drawingInfo}
      </div>

      {/* Right - Coordinates and zoom */}
      <div className="flex items-center gap-4 text-space-500">
        <span>Grid: {gridSize}px</span>
        <button
          onClick={handleZoom100}
          className="px-2 py-0.5 hover:bg-space-700 rounded text-space-400 hover:text-white transition-colors"
          title="Reset zoom to 100%"
        >
          Zoom: {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          onClick={handleCenterOnSelection}
          disabled={selection.ids.length === 0}
          className="px-2 py-0.5 hover:bg-space-700 rounded text-space-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Center on selection (requires selection)"
        >
          ⌖ Center
        </button>
        <span>Pan: ({Math.round(viewport.x)}, {Math.round(viewport.y)})</span>
      </div>
    </div>
  )
}
