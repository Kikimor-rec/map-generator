import { useEditor, actions } from '@store/EditorContext'
import { RoomType, ROOM_TYPE_CONFIGS, EditorTool, LayerType } from '@core/types'
import { EyeIcon, EyeOffIcon } from '@ui/components/Icons'

export function RightPanel() {
  const { state, dispatch, activeDeck, rooms } = useEditor()
  const { activeTool, activeRoomType, selection, layers } = state

  const allRoomTypes = Object.values(ROOM_TYPE_CONFIGS)

  // Get selected room
  const selectedRoom = selection.type === 'room' && selection.ids.length > 0
    ? rooms.find(r => r.id === selection.ids[0])
    : null

  return (
    <div className="w-72 bg-space-900 border-l border-space-700 flex flex-col overflow-hidden">
      {/* Room type selector - shown when Room tool is active */}
      {activeTool === EditorTool.Room && (
        <div className="panel m-2">
          <div className="panel-header">Room Type</div>
          <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
            {allRoomTypes.map((config) => (
              <button
                key={config.id}
                onClick={() => dispatch(actions.setActiveRoomType(config.id))}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left text-sm transition-all ${
                  activeRoomType === config.id
                    ? 'bg-space-700 border border-cyber-blue text-cyber-blue'
                    : 'bg-space-800 border border-transparent text-space-300 hover:border-space-500'
                }`}
              >
                <span className="text-lg">{config.icon}</span>
                <div className="flex-1">
                  <div className="text-xs">{config.name}</div>
                  <div className="text-[10px] text-space-400">{config.nameRu}</div>
                </div>
                <div
                  className="w-4 h-4 rounded border border-space-500"
                  style={{ backgroundColor: config.defaultColor }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Room properties - shown when a room is selected */}
      {selectedRoom && (
        <div className="panel m-2">
          <div className="panel-header">Room Properties</div>
          <div className="p-3 space-y-3">
            {/* Name */}
            <div>
              <label className="label">Name</label>
              <input
                type="text"
                value={selectedRoom.name}
                onChange={(e) => dispatch(actions.updateRoom(selectedRoom.id, { name: e.target.value }))}
                className="input"
              />
            </div>

            {/* Type */}
            <div>
              <label className="label">Type</label>
              <select
                value={selectedRoom.type}
                onChange={(e) => dispatch(actions.updateRoom(selectedRoom.id, { type: e.target.value as RoomType }))}
                className="input"
              >
                {allRoomTypes.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.icon} {config.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Size info */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Width</label>
                <input
                  type="number"
                  value={Math.round(selectedRoom.bounds.width / 32)}
                  readOnly
                  className="input bg-space-900"
                />
              </div>
              <div>
                <label className="label">Height</label>
                <input
                  type="number"
                  value={Math.round(selectedRoom.bounds.height / 32)}
                  readOnly
                  className="input bg-space-900"
                />
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="label">Fill Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={selectedRoom.color || ROOM_TYPE_CONFIGS[selectedRoom.type].defaultColor}
                  onChange={(e) => dispatch(actions.updateRoom(selectedRoom.id, { color: e.target.value }))}
                  className="w-12 h-8 rounded cursor-pointer border border-space-600"
                />
                <div className="flex-1 flex flex-wrap gap-1">
                  {['#1e3a5f', '#2d4a3e', '#4a3a2e', '#3a2a4a', '#4a2a2a', '#2a3a4a', '#3a4a4a', '#4a4a3a'].map(color => (
                    <button
                      key={color}
                      onClick={() => dispatch(actions.updateRoom(selectedRoom.id, { color }))}
                      className="w-6 h-6 rounded border border-space-600 hover:border-cyber-blue"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            {/* Border Color */}
            <div>
              <label className="label">Border Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={selectedRoom.borderColor || ROOM_TYPE_CONFIGS[selectedRoom.type].borderColor}
                  onChange={(e) => dispatch(actions.updateRoom(selectedRoom.id, { borderColor: e.target.value }))}
                  className="w-12 h-8 rounded cursor-pointer border border-space-600"
                />
                <div className="flex-1 flex flex-wrap gap-1">
                  {['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#ffffff'].map(color => (
                    <button
                      key={color}
                      onClick={() => dispatch(actions.updateRoom(selectedRoom.id, { borderColor: color }))}
                      className="w-6 h-6 rounded border border-space-600 hover:border-cyber-blue"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            {/* Reset to default */}
            <button
              onClick={() => dispatch(actions.updateRoom(selectedRoom.id, { 
                color: undefined, 
                borderColor: undefined 
              }))}
              className="btn btn-secondary w-full text-xs"
            >
              Reset to Default Colors
            </button>
          </div>
        </div>
      )}

      {/* Layers panel */}
      <div className="panel m-2 flex-1 overflow-hidden flex flex-col">
        <div className="panel-header">Layers</div>
        <div className="p-2 space-y-1 overflow-y-auto flex-1">
          {layers.map((layer) => (
            <div
              key={layer.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded bg-space-800 text-sm"
            >
              <button
                onClick={() => dispatch(actions.toggleLayer(layer.id))}
                className={`w-5 h-5 flex items-center justify-center rounded ${
                  layer.isVisible ? 'text-cyber-green' : 'text-space-500'
                }`}
              >
                {layer.isVisible ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
              </button>
              <span className="flex-1 text-space-300">{layer.name}</span>
              <span className="text-[10px] text-space-500">{layer.nameRu}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Deck info */}
      <div className="panel m-2">
        <div className="panel-header">Deck Info</div>
        <div className="p-3 text-sm text-space-400">
          <div className="flex justify-between">
            <span>Rooms:</span>
            <span className="text-space-200">{activeDeck?.rooms.length || 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Corridors:</span>
            <span className="text-space-200">{activeDeck?.corridors.length || 0}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
