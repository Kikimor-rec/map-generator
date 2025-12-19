/**
 * Generation Panel
 * UI for configuring and running the procedural map generator
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useEditor, actions } from '@store/EditorContext'
import { DEFAULT_LAYERS, MAP_THEMES, MapThemeId } from '@core/types'
import { DEFAULT_COALESCE_SETTINGS, DEFAULT_ROUTING_COSTS } from '@core/corridorTypes'
import {
  generateMap,
  convertToEditorFormat,
  ARCHETYPE_CONFIGS,
  type GeneratorOptions,
  type Archetype,
  type Subtype,
  type SizeTier,
  type StyleProfile,
} from '@generators/index'
import {
  runQualityPipeline,
  type QualityMode,
  type RefinementUpdate,
  QUALITY_MODE_CONFIGS,
} from '@generators/quality'

// TYPES
interface GenerationPanelProps {
  isOpen: boolean
  onClose: () => void
}

interface GenerationState {
  isGenerating: boolean
  lastSeed: string | null
  lastTiming: number | null
  error: string | null
  progress: number
  candidatesEvaluated: number
  qualityPhase: 'draft' | 'improved' | 'final' | null
}

// CONSTANTS
const SIZE_TIERS: Array<{ value: SizeTier; label: string; description: string }> = [
  { value: 'xs', label: 'XS', description: '4-8 rooms' },
  { value: 'sm', label: 'S', description: '8-16 rooms' },
  { value: 'md', label: 'M', description: '16-32 rooms' },
  { value: 'lg', label: 'L', description: '32-64 rooms' },
  { value: 'xl', label: 'XL', description: '64-128 rooms' },
]

const STYLE_PROFILES: Array<{ value: StyleProfile; label: string }> = [
  { value: 'utilitarian', label: 'Utilitarian' },
  { value: 'military', label: 'Military' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'organic', label: 'Organic' },
  { value: 'alien', label: 'Alien' },
]

const QUALITY_MODES: Array<{ value: QualityMode; label: string; description: string }> = [
  { value: 'draft', label: 'Draft', description: '< 200ms, quick preview' },
  { value: 'standard', label: 'Standard', description: '< 2s, playable, up to 20 candidates' },
  { value: 'polish', label: 'Polish', description: '< 10s, best quality' },
]

export function GenerationPanel({ isOpen, onClose }: GenerationPanelProps) {
  const { dispatch } = useEditor()
  const abortControllerRef = useRef<AbortController | null>(null)

  // Generation options
  const [archetype, setArchetype] = useState<Archetype>('ship')
  const [subtype, setSubtype] = useState<Subtype>('explorer')
  const [sizeTier, setSizeTier] = useState<SizeTier>('md')
  const [styleProfile, setStyleProfile] = useState<StyleProfile>('utilitarian')
  const [loopiness, setLoopiness] = useState(0.5)
  const [danger, setDanger] = useState(0.3)
  const [seed, setSeed] = useState('')

  // Quality mode
  const [qualityMode, setQualityMode] = useState<QualityMode>('standard')
  const [useQualityPipeline, setUseQualityPipeline] = useState(true)

  // Advanced routing options
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [coalesceEnabled, setCoalesceEnabled] = useState(DEFAULT_COALESCE_SETTINGS.enabled)
  const [bendPenalty, setBendPenalty] = useState(DEFAULT_ROUTING_COSTS.bendPenalty)
  const [reuseBonus, setReuseBonus] = useState(DEFAULT_ROUTING_COSTS.reuseBonus)
  const [crossingPenalty, setCrossingPenalty] = useState(DEFAULT_ROUTING_COSTS.crossingPenalty)

  // Generation state
  const [genState, setGenState] = useState<GenerationState>({
    isGenerating: false,
    lastSeed: null,
    lastTiming: null,
    error: null,
    progress: 0,
    candidatesEvaluated: 0,
    qualityPhase: null,
  })
  const [showSlowIndicator, setShowSlowIndicator] = useState(false)
  const [plainStatus, setPlainStatus] = useState<string | null>(null)

  // Available subtypes
  const availableSubtypes = ARCHETYPE_CONFIGS[archetype].subtypes

  const handleArchetypeChange = useCallback((newArchetype: Archetype) => {
    setArchetype(newArchetype)
    const subtypes = ARCHETYPE_CONFIGS[newArchetype].subtypes
    if (subtypes.length > 0) {
      setSubtype(subtypes[0].id as Subtype)
    }
  }, [])

  const generateRandomSeed = useCallback(() => {
    const newSeed = Math.random().toString(36).substring(2, 10).toUpperCase()
    setSeed(newSeed)
    return newSeed
  }, [])

  // Long-running indicator
  useEffect(() => {
    let timer: number | undefined
    if (genState.isGenerating) {
      timer = window.setTimeout(() => setShowSlowIndicator(true), 1000)
      if (!useQualityPipeline) {
        setPlainStatus('Generating...')
      }
    } else {
      setShowSlowIndicator(false)
      setPlainStatus(null)
    }
    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [genState.isGenerating, useQualityPipeline])

  // Simulated progress for non-quality runs (keeps the bar moving up to 90%)
  useEffect(() => {
    if (!genState.isGenerating || useQualityPipeline) return
    const timer = window.setInterval(() => {
      setGenState(s => {
        if (!s.isGenerating) return s
        const next = Math.min(90, s.progress + 3)
        return { ...s, progress: next }
      })
    }, 250)
    return () => window.clearInterval(timer)
  }, [genState.isGenerating, useQualityPipeline])

  // Run generation
  // Worker Ref
  const workerRef = useRef<Worker | null>(null);

  // Run generation
  const handleGenerate = useCallback(async () => {
    setGenState(s => ({
      ...s,
      isGenerating: true,
      error: null,
      progress: 0,
      candidatesEvaluated: 0,
      qualityPhase: null,
    }))
    setPlainStatus(null)

    const useSeed = seed.trim() || generateRandomSeed()

    // Initialize Worker
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    try {
      const worker = new Worker(new URL('../../workers/generation.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { type, payload } = e.data;
        if (type === 'PROGRESS') {
          if (useQualityPipeline) {
            setGenState(s => ({
              ...s,
              progress: payload.progress,
              qualityPhase: payload.stage
            }));
            if (payload.message && payload.message.includes('Candidates:')) {
              const match = payload.message.match(/Candidates: (\d+)/);
              if (match) {
                setGenState(s => ({ ...s, candidatesEvaluated: parseInt(match[1]) }));
              }
            }
          } else {
            setPlainStatus(payload.message || 'Processing...');
          }
        } else if (type === 'COMPLETE') {
          const mapData = payload; // map object

          // Logic to convert mapData to newProject for Dispatch
          // This logic is moved from the main thread execution to here
          try {
            // Check if Quality Result (PipelineResult) or Standard (MapJSON)
            let editorData: any;
            let name = useSeed;
            let description = `${archetype} - ${subtype}`;
            let metaData: any = {};

            if (mapData.bestCandidate) { // PipelineResult
              const best = mapData.bestCandidate.data;
              // HACK: Reconstruct MapJSON-like structure for convertToEditorFormat
              // Or manually build editorData.
              // Given we can't easily import convertToEditorFormat inside the worker, 
              // we rely on it being available here.

              // BUT, if mapData is PipelineResult, it contains `mapData` (MapJSON Compat) in bestCandidate.data.mapData
              // Let's check pipeline.ts: `bestCandidate.data` is `CandidateData`. 
              // It DOES NOT seem to have `mapData` property?
              // Wait, looking at lines 215 of original file:
              // `if (pipelineResult.bestCandidate?.data.mapData) {`
              // So it SEEMS it does have it?
              // Let's assume the Worker returns the FULL object structure including mapData if available.

              if (mapData.bestCandidate.data.mapData) {
                const md = mapData.bestCandidate.data.mapData;
                editorData = convertToEditorFormat(md, 0);
                name = md.meta.name;
                description = `${md.meta.archetype} - ${md.meta.subtype}`;
                metaData = {
                  generator: 'quality-pipeline',
                  seed: useSeed,
                  archetype, subtype, qualityMode,
                  candidatesEvaluated: mapData.candidatesEvaluated,
                  score: mapData.bestCandidate.score
                };
              } else {
                // Fallback if mapData missing
                throw new Error("Quality pipeline result missing map data");
              }

            } else { // Standard MapJSON
              editorData = convertToEditorFormat(mapData, 0);
              name = mapData.meta.name;
              description = `${mapData.meta.archetype} - ${mapData.meta.subtype}`;
              metaData = {
                generator: 'procedural',
                seed: useSeed,
                archetype, subtype
              };
            }

            const newDeck = {
              id: crypto.randomUUID(),
              name: 'Deck 1',
              level: 1,
              rooms: editorData.rooms,
              corridors: editorData.corridors,
            }

            const newProject = {
              id: crypto.randomUUID(),
              name: name,
              description: description,
              version: '1.0.0',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              gridSize: 40,
              decks: [newDeck],
              layers: [...DEFAULT_LAYERS],
              theme: MAP_THEMES[MapThemeId.Blueprint],
              metadata: metaData,
            }

            dispatch(actions.loadProject(newProject))

            setGenState({
              isGenerating: false,
              lastSeed: useSeed,
              lastTiming: 0, // Worker doesn't return timing easily yet
              error: null,
              progress: 100,
              candidatesEvaluated: metaData.candidatesEvaluated || 0,
              qualityPhase: null,
            })
            setPlainStatus(null)
            onClose();

          } catch (err: any) {
            setGenState(s => ({ ...s, isGenerating: false, error: err.message }))
          }

          worker.terminate();
          workerRef.current = null;

        } else if (type === 'ERROR') {
          setGenState(s => ({ ...s, isGenerating: false, error: payload.message }));
          worker.terminate();
          workerRef.current = null;
        }
      };

      // Start
      worker.postMessage({
        type: 'START_GENERATION',
        payload: {
          seed: useSeed,
          archetype,
          subtype,
          sizeTier,
          styleProfile,
          loopiness,
          danger,
          useQuality: useQualityPipeline,
          qualityMode
        }
      });

    } catch (error: any) {
      setGenState(s => ({ ...s, isGenerating: false, error: error.message }));
    }

  }, [seed, archetype, subtype, sizeTier, styleProfile, loopiness, danger, useQualityPipeline, qualityMode, dispatch, onClose, generateRandomSeed])

  const handleCancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'CANCEL' });
    }
    setGenState(s => ({ ...s, isGenerating: false, error: 'Cancelled' }));
  }, []);


  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="panel w-[720px] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="panel-header flex items-center justify-between">
          <span>Map Generator</span>
          <button onClick={onClose} className="text-space-400 hover:text-white">
            X
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-4 space-y-3">
            {/* Seed Input */}
            <div className="space-y-1">
              <label className="label">Seed</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={seed}
                  onChange={e => setSeed(e.target.value.toUpperCase())}
                  placeholder="Random seed"
                  className="input flex-1"
                />
                <button
                  onClick={generateRandomSeed}
                  className="btn btn-secondary"
                  title="Generate random seed"
                >
                  Random
                </button>
              </div>
            </div>

            {/* Compact two-column layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-3">
                {/* Archetype Selection */}
                <div className="space-y-1">
                  <label className="label">Archetype</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['ship', 'station', 'outpost'] as Archetype[]).map(arch => (
                      <button
                        key={arch}
                        onClick={() => handleArchetypeChange(arch)}
                        className={`px-3 py-2 rounded text-sm font-medium border transition-all ${archetype === arch
                          ? 'bg-space-700 border-cyber-blue text-cyber-blue'
                          : 'bg-space-800 border-space-600 text-space-300 hover:border-space-500'
                          }`}
                      >
                        {ARCHETYPE_CONFIGS[arch].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subtype Selection */}
                <div className="space-y-1">
                  <label className="label">Subtype</label>
                  <select
                    value={subtype}
                    onChange={e => setSubtype(e.target.value as Subtype)}
                    className="input w-full"
                  >
                    {availableSubtypes.map(st => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Style Profile */}
                <div className="space-y-1">
                  <label className="label">Style</label>
                  <select
                    value={styleProfile}
                    onChange={e => setStyleProfile(e.target.value as StyleProfile)}
                    className="input w-full"
                  >
                    {STYLE_PROFILES.map(sp => (
                      <option key={sp.value} value={sp.value}>
                        {sp.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                {/* Size Tier */}
                <div className="space-y-1">
                  <label className="label">Size</label>
                  <div className="grid grid-cols-5 gap-1">
                    {SIZE_TIERS.map(tier => (
                      <button
                        key={tier.value}
                        onClick={() => setSizeTier(tier.value)}
                        className={`px-2 py-2 rounded text-sm font-medium border transition-all ${sizeTier === tier.value
                          ? 'bg-space-700 border-cyber-blue text-cyber-blue'
                          : 'bg-space-800 border-space-600 text-space-300 hover:border-space-500'
                          }`}
                        title={tier.description}
                      >
                        {tier.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-space-400">
                    {SIZE_TIERS.find(t => t.value === sizeTier)?.description}
                  </p>
                </div>

                {/* Quality Mode */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="label">Quality mode</label>
                    <label className="flex items-center gap-1 text-xs text-space-400">
                      <input
                        type="checkbox"
                        checked={useQualityPipeline}
                        onChange={e => setUseQualityPipeline(e.target.checked)}
                        className="w-3 h-3"
                      />
                      Quality Pipeline
                    </label>
                  </div>
                  {useQualityPipeline && (
                    <>
                      <div className="grid grid-cols-3 gap-1">
                        {QUALITY_MODES.map(qm => (
                          <button
                            key={qm.value}
                            onClick={() => setQualityMode(qm.value)}
                            className={`px-2 py-2 rounded text-sm font-medium border transition-all ${qualityMode === qm.value
                              ? 'bg-space-700 border-cyber-blue text-cyber-blue'
                              : 'bg-space-800 border-space-600 text-space-300 hover:border-space-500'
                              }`}
                            title={qm.description}
                          >
                            {qm.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-space-400">
                        {QUALITY_MODES.find(q => q.value === qualityMode)?.description} / up to{' '}
                        {QUALITY_MODE_CONFIGS[qualityMode].maxCandidates} candidates
                      </p>
                    </>
                  )}
                </div>

                {/* Loopiness Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="label">Connectivity</label>
                    <span className="text-xs text-space-400">{Math.round(loopiness * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={loopiness}
                    onChange={e => setLoopiness(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-space-500">
                    <span>Linear</span>
                    <span>Labyrinth</span>
                  </div>
                </div>

                {/* Danger Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="label">Danger</label>
                    <span className="text-xs text-space-400">{Math.round(danger * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={danger}
                    onChange={e => setDanger(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-space-500">
                    <span>Safe</span>
                    <span>Dangerous</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Options Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full py-2 px-3 text-sm text-left text-space-400 hover:text-space-200 border border-space-700 rounded hover:border-space-600 transition-colors flex justify-between items-center"
            >
              <span>Advanced corridor settings</span>
              <span>{showAdvanced ? 'Hide' : 'Show'}</span>
            </button>

            {/* Advanced Routing Options */}
            {showAdvanced && (
              <div className="space-y-3 p-3 bg-space-800/50 rounded border border-space-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={coalesceEnabled}
                    onChange={e => setCoalesceEnabled(e.target.checked)}
                    className="w-4 h-4 accent-cyber-blue"
                  />
                  <span className="text-sm text-space-200">Merge overlapping corridors</span>
                </label>
                <p className="text-xs text-space-500 -mt-2 ml-6">
                  Encourages shared trunks instead of duplicated parallel lines.
                </p>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-xs text-space-400">Bend penalty</label>
                    <span className="text-xs text-space-500">{bendPenalty.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="0.5"
                    value={bendPenalty}
                    onChange={e => setBendPenalty(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-xs text-space-400">Reuse bonus</label>
                    <span className="text-xs text-space-500">{reuseBonus.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="0"
                    step="0.5"
                    value={reuseBonus}
                    onChange={e => setReuseBonus(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-space-500">
                    <span>Discourage reuse</span>
                    <span>Favor shared trunks</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="text-xs text-space-400">Crossing penalty</label>
                    <span className="text-xs text-space-500">{crossingPenalty.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={crossingPenalty}
                    onChange={e => setCrossingPenalty(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Preview info */}
            <div className="p-3 bg-space-800 rounded border border-space-600 text-sm">
              <div className="text-space-400 mb-2">Preview:</div>
              <div className="text-space-200">
                <strong>{ARCHETYPE_CONFIGS[archetype].label}</strong> -{' '}
                {availableSubtypes.find(s => s.id === subtype)?.label}
                <br />
                <span className="text-xs text-space-400">
                  Size: {SIZE_TIERS.find(t => t.value === sizeTier)?.description} / Connectivity:{' '}
                  {Math.round(loopiness * 100)}%
                </span>
              </div>
            </div>

            {/* Error */}
            {genState.error && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
                {genState.error}
              </div>
            )}

            {genState.isGenerating && useQualityPipeline && (
              <div className="p-3 bg-space-800 border border-space-600 rounded space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-space-300">
                    {genState.qualityPhase ? `Phase: ${genState.qualityPhase.toUpperCase()}` : 'Generating...'}
                  </span>
                  <span className="text-cyber-blue font-mono">
                    {genState.progress.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-space-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyber-blue to-cyber-pink transition-all duration-300"
                    style={{ width: `${genState.progress}%` }}
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleCancel}
                    className="px-3 py-1 bg-red-900/50 hover:bg-red-800 text-red-200 text-xs rounded border border-red-800/50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Simple status for non-quality runs */}
            {genState.isGenerating && !useQualityPipeline && (
              <div className="p-3 bg-space-800 border border-space-600 rounded space-y-2 text-sm text-space-300">
                <div className="flex justify-between">
                  <span>{plainStatus || 'Generating...'}</span>
                  <span className="text-cyber-blue font-mono">{genState.progress.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-space-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyber-blue to-cyber-pink transition-all duration-300"
                    style={{ width: `${Math.max(15, genState.progress)}%` }}
                  />
                </div>
                <div className="text-xs text-space-500">
                  Rooms/layout/routing... {showSlowIndicator ? '(still running)' : ''}
                </div>
              </div>
            )}

            {/* Slow indicator for long-running jobs (>1s) */}
            {genState.isGenerating && showSlowIndicator && (
              <div className="p-2 bg-space-800 border border-space-700 rounded text-xs text-space-300 flex items-center justify-between">
                <span>Still generating... ({'>'}1s)</span>
                <span className="text-cyber-blue font-mono">{seed || genState.lastSeed}</span>
              </div>
            )}

            {/* Success info */}
            {genState.lastSeed && !genState.error && !genState.isGenerating && (
              <div className="p-3 bg-green-900/30 border border-green-700 rounded text-green-400 text-sm">
                Done! Seed: <span className="font-mono">{genState.lastSeed}</span>
                {genState.lastTiming && (
                  <span className="text-green-500 ml-2">({genState.lastTiming.toFixed(0)}ms)</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-space-700 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            className="btn btn-cyber"
            disabled={genState.isGenerating}
          >
            {genState.isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div >
    </div >
  )
}

