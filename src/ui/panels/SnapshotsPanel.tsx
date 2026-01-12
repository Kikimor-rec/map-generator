import { useRef, useEffect, useState } from 'react'
import { useEditor, actions } from '@store/EditorContext'
import { MapThemeId, type MapProject } from '@core/types'
import { Snapshot } from '@store/EditorContext'

interface SnapshotsPanelProps {
    isOpen: boolean
    onClose: () => void
}

export function SnapshotsPanel({ isOpen, onClose }: SnapshotsPanelProps) {
    const { state, dispatch } = useEditor()
    const { snapshots } = state
    const [snapshotName, setSnapshotName] = useState('')

    if (!isOpen) return null

    const handleCreateSnapshot = () => {
        const name = snapshotName.trim() || `Variant ${snapshots.length + 1}`

        // Try to capture canvas thumbnail
        const canvas = document.querySelector('canvas')
        let thumbnail: string | undefined
        if (canvas) {
            try {
                thumbnail = canvas.toDataURL('image/png', 0.5) // Low quality for thumbnail
            } catch (e) {
                console.warn('Failed to create thumbnail', e)
            }
        }

        dispatch(actions.createSnapshot(name, thumbnail))
        setSnapshotName('')
    }

    const handleRestore = (id: string) => {
        if (confirm('Restore this snapshot? Current unsaved changes will be pushed to history.')) {
            dispatch(actions.restoreSnapshot(id))
            onClose()
        }
    }

    const handleDelete = (id: string) => {
        if (confirm('Delete this snapshot?')) {
            dispatch(actions.deleteSnapshot(id))
        }
    }

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-space-900 border border-cyber-blue rounded-lg w-[600px] h-[500px] flex flex-col shadow-2xl shadow-cyber-blue/20">

                {/* Header */}
                <div className="p-4 border-b border-space-700 flex justify-between items-center bg-space-800 rounded-t-lg">
                    <h2 className="text-xl font-display text-cyber-blue tracking-wide">
                        Variant Gallery
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-space-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">

                    {/* Create New */}
                    <div className="bg-space-800 p-4 rounded border border-space-700">
                        <div className="text-sm text-space-300 mb-2">Create New Variant from Current State</div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={snapshotName}
                                onChange={(e) => setSnapshotName(e.target.value)}
                                placeholder="Variant Name"
                                className="input flex-1"
                            />
                            <button
                                onClick={handleCreateSnapshot}
                                className="btn btn-cyber"
                            >
                                📸 Snapshot
                            </button>
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {snapshots.length === 0 ? (
                            <div className="text-center text-space-500 py-10 italic">
                                No snapshots saved yet.
                            </div>
                        ) : (
                            snapshots.map(snap => (
                                <div key={snap.id} className="bg-space-800 p-3 rounded border border-space-700 hover:border-space-500 transition-colors flex gap-3">
                                    {snap.thumbnail ? (
                                        <div className="w-24 h-24 bg-black rounded overflow-hidden flex-shrink-0 border border-space-600">
                                            <img src={snap.thumbnail} alt={snap.name} className="w-full h-full object-cover" />
                                        </div>
                                    ) : (
                                        <div className="w-24 h-24 bg-space-900 rounded flex items-center justify-center text-space-600 border border-space-600 flex-shrink-0">
                                            <span>No Image</span>
                                        </div>
                                    )}
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="text-cyber-blue font-bold">{snap.name}</div>
                                            <div className="text-xs text-space-400">
                                                {new Date(snap.createdAt).toLocaleTimeString()} • {snap.decks[0]?.rooms?.length ?? 0} rooms
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => handleRestore(snap.id)}
                                                className="btn btn-secondary text-xs py-1"
                                            >
                                                Restore
                                            </button>
                                            <button
                                                onClick={() => handleDelete(snap.id)}
                                                className="btn bg-red-900/40 text-red-300 border-red-900/50 hover:bg-red-900/60 text-xs py-1"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                </div>

            </div>
        </div>
    )
}
