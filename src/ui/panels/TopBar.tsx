import { useState, useEffect } from 'react'
import { useEditor, actions } from '@store/EditorContext'
import { MapThemeId, MAP_THEMES, type MapProject } from '@core/types'
import { GenerationPanel } from './GenerationPanel'
import { SnapshotsPanel } from './SnapshotsPanel'
import { CommandPalette } from './CommandPalette'

export function TopBar() {
  const [showGenerationPanel, setShowGenerationPanel] = useState(false)
  const [showSnapshotsPanel, setShowSnapshotsPanel] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  // Global Ctrl+K shortcut for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowCommandPalette(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  const { state, dispatch, canUndo, canRedo } = useEditor()
  const { project, isDirty, viewport, activeTheme } = state

  const handleNewProject = () => {
    const name = prompt('Project name:', 'New Spaceship')
    if (name) {
      dispatch(actions.newProject(name))
    }
  }

  const handleSave = () => {
    if (project) {
      const projectData = { ...project, updatedAt: new Date().toISOString() }
      const json = JSON.stringify(projectData, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectData.name.replace(/\s+/g, '_')}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleLoad = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const loadedProject = JSON.parse(e.target?.result as string) as MapProject
            dispatch(actions.loadProject(loadedProject))
          } catch (err) {
            alert('Invalid project file')
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  const handleExportPNG = async () => {
    // Find the canvas element and use PixiJS extraction
    const canvas = document.querySelector('.canvas-container canvas') as HTMLCanvasElement
    if (!canvas) {
      alert('Canvas not found')
      return
    }
    
    setIsExporting(true)
    try {
      // Small delay to show indicator
      await new Promise(r => setTimeout(r, 50))
      
      // For WebGL canvas, we need to ensure preserveDrawingBuffer or use a workaround
      // Create a new canvas and draw the WebGL content
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      const ctx = tempCanvas.getContext('2d')
      
      if (ctx) {
        // WebGL to 2D canvas copy
        ctx.drawImage(canvas, 0, 0)
        
        const link = document.createElement('a')
        link.download = `${project?.name || 'map'}.png`
        link.href = tempCanvas.toDataURL('image/png')
        link.click()
      }
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed. Try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-space-900 border-b border-space-700">
      {/* Left section - Logo and File menu */}
      <div className="flex items-center gap-4">
        <h1 className="font-display text-lg text-cyber-blue font-bold tracking-wider">
          SCI-FI MAP
        </h1>
        
        <div className="flex items-center gap-2">
          <button onClick={handleNewProject} className="btn btn-secondary text-sm">
            📄 New
          </button>
          <button onClick={handleLoad} className="btn btn-secondary text-sm">
            📂 Open
          </button>
          <button onClick={handleSave} className="btn btn-secondary text-sm" disabled={!project}>
            💾 Save
          </button>
          <button 
            onClick={handleExportPNG} 
            className="btn btn-secondary text-sm" 
            disabled={!project || isExporting}
          >
            {isExporting ? '⏳ Exporting...' : '🖼️ Export PNG'}
          </button>
          <button 
            onClick={() => setShowGenerationPanel(true)} 
            className="btn btn-cyber text-sm"
            disabled={!project}
          >
            🚀 Generate
          </button>
          <button 
            onClick={() => setShowSnapshotsPanel(true)} 
            className="btn btn-secondary text-sm"
            disabled={!project}
            title="Save/Load map variants"
          >
            📸 Snapshots
          </button>
        </div>

        <div className="h-6 border-l border-space-600 mx-2" />

        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <button 
            onClick={() => dispatch(actions.undo())} 
            disabled={!canUndo}
            className="btn-icon disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            ↩️
          </button>
          <button 
            onClick={() => dispatch(actions.redo())} 
            disabled={!canRedo}
            className="btn-icon disabled:opacity-30"
            title="Redo (Ctrl+Y)"
          >
            ↪️
          </button>
        </div>
      </div>

      {/* Center - Project name */}
      <div className="flex items-center gap-2">
        <span className="text-space-300 text-sm">
          {project?.name || 'No project'}
        </span>
        {isDirty && (
          <span className="text-cyber-orange text-xs">●</span>
        )}
      </div>

      {/* Right section - Zoom and Theme */}
      <div className="flex items-center gap-4">
        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button onClick={() => dispatch(actions.zoomOut())} className="btn-icon" title="Zoom Out">
            ➖
          </button>
          <span className="text-space-300 text-sm w-16 text-center">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button onClick={() => dispatch(actions.zoomIn())} className="btn-icon" title="Zoom In">
            ➕
          </button>
          <button onClick={() => dispatch(actions.resetViewport())} className="btn-icon" title="Reset View">
            🔄
          </button>
        </div>

        <div className="h-6 border-l border-space-600 mx-2" />

        {/* Theme selector */}
        <select
          value={activeTheme.id}
          onChange={(e) => dispatch(actions.setTheme(e.target.value as MapThemeId))}
          className="input w-40 text-sm"
        >
          {Object.values(MAP_THEMES).map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </div>
      
      {/* Generation Panel Modal */}
      <GenerationPanel 
        isOpen={showGenerationPanel} 
        onClose={() => setShowGenerationPanel(false)} 
      />
      
      {/* Snapshots Panel Modal */}
      <SnapshotsPanel 
        isOpen={showSnapshotsPanel} 
        onClose={() => setShowSnapshotsPanel(false)} 
      />
      
      {/* Command Palette Modal */}
      <CommandPalette 
        isOpen={showCommandPalette} 
        onClose={() => setShowCommandPalette(false)}
        onOpenGenerate={() => setShowGenerationPanel(true)}
        onOpenSnapshots={() => setShowSnapshotsPanel(true)}
      />
    </div>
  )
}
