import { useEditor, actions } from '@store/EditorContext'
import { EditorTool } from '@core/types'
import { 
  SelectIcon, 
  PanIcon, 
  RoomIcon, 
  CorridorIcon, 
  DoorIcon, 
  ObjectIcon, 
  EraserIcon, 
  AnnotateIcon 
} from '@ui/components/Icons'

const TOOLS = [
  { id: EditorTool.Select, Icon: SelectIcon, label: 'Select', shortcut: 'V' },
  { id: EditorTool.Pan, Icon: PanIcon, label: 'Pan', shortcut: 'H' },
  { id: EditorTool.Room, Icon: RoomIcon, label: 'Room', shortcut: 'R' },
  { id: EditorTool.Corridor, Icon: CorridorIcon, label: 'Corridor', shortcut: 'C' },
  { id: EditorTool.Door, Icon: DoorIcon, label: 'Door', shortcut: 'D' },
  { id: EditorTool.Object, Icon: ObjectIcon, label: 'Object', shortcut: 'O' },
  { id: EditorTool.Eraser, Icon: EraserIcon, label: 'Eraser', shortcut: 'E' },
  { id: EditorTool.Annotate, Icon: AnnotateIcon, label: 'Annotate', shortcut: 'A' },
]

// Grid icon component
const GridIcon = ({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>
)

// Snap icon component
const SnapIcon = ({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    <circle cx="12" cy="12" r="4" />
    <path d="M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
)

export function Toolbar() {
  const { state, dispatch } = useEditor()
  const { activeTool, showGrid, snapToGrid } = state

  return (
    <div className="flex flex-col gap-2 p-2 bg-space-900 border-r border-space-700">
      {/* Tool buttons */}
      <div className="flex flex-col gap-1">
        {TOOLS.map((tool) => (
          <div key={tool.id} className="relative group">
            <button
              className={`tool-button ${activeTool === tool.id ? 'active' : ''}`}
              onClick={() => dispatch(actions.setActiveTool(tool.id))}
              title={`${tool.label} (${tool.shortcut})`}
            >
              <tool.Icon size={20} />
            </button>
            
            {/* Tooltip with instructions */}
            <div className="absolute left-full ml-2 top-0 hidden group-hover:block z-50 whitespace-nowrap">
              <div className="bg-space-800 border border-space-600 rounded px-3 py-2 shadow-lg">
                <div className="text-sm text-space-100 font-medium">{tool.label}</div>
                <div className="text-xs text-space-400">Hotkey: {tool.shortcut}</div>
                {tool.id === EditorTool.Corridor && (
                  <div className="text-xs text-space-400 mt-1 border-t border-space-600 pt-1">
                    <div>• Клик - добавить точку</div>
                    <div>• Enter / Двойной клик - завершить</div>
                    <div>• Esc - отменить</div>
                  </div>
                )}
                {tool.id === EditorTool.Room && (
                  <div className="text-xs text-space-400 mt-1 border-t border-space-600 pt-1">
                    <div>• Зажать и тянуть для создания</div>
                  </div>
                )}
                {tool.id === EditorTool.Select && (
                  <div className="text-xs text-space-400 mt-1 border-t border-space-600 pt-1">
                    <div>• Двойной клик по коридору - добавить изгиб</div>
                    <div>• ПКМ на точке - меню прикрепления</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-space-700 my-2" />

      {/* Grid controls */}
      <button
        className={`tool-button ${showGrid ? 'active' : ''}`}
        onClick={() => dispatch(actions.toggleGrid())}
        title="Toggle Grid (G)"
      >
        <GridIcon size={20} />
      </button>

      <button
        className={`tool-button ${snapToGrid ? 'active' : ''}`}
        onClick={() => dispatch(actions.toggleSnapToGrid())}
        title="Snap to Grid (S)"
      >
        <SnapIcon size={20} />
      </button>
      
      {/* Active tool indicator */}
      {activeTool === EditorTool.Corridor && (
        <div className="mt-auto pt-2 border-t border-space-700">
          <div className="text-xs text-cyber-400 text-center">
            Режим коридора
          </div>
          <div className="text-xs text-space-400 text-center mt-1">
            Кликните для точек
          </div>
        </div>
      )}
    </div>
  )
}
