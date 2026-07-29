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
  deriveGridCandidateSeed,
  rankGridCandidates,
  ARCHETYPE_CONFIGS,
  type GeneratorOptions,
  type Archetype,
  type Subtype,
  type SizeTier,
  type StyleProfile,
  type MapJSON,
  type CandidateSelectionObjectives,
  type CandidateSelectionSummary,
} from '@generators/index'
import {
  type QualityMode,
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
  { value: 'xs', label: 'XS', description: 'Compact deck' },
  { value: 'sm', label: 'S', description: 'Small deck' },
  { value: 'md', label: 'M', description: 'Medium deck' },
  { value: 'lg', label: 'L', description: 'Large deck' },
  { value: 'xl', label: 'XL', description: 'Huge deck' },
]

const STYLE_PROFILES: Array<{ value: StyleProfile; label: string }> = [
  { value: 'utilitarian', label: 'Utilitarian' },
  { value: 'military', label: 'Military' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'organic', label: 'Organic' },
  { value: 'alien', label: 'Alien' },
  { value: 'realism', label: 'Realism' },
  { value: 'futurism', label: 'Futurism' },
]

const QUALITY_MODES: Array<{ value: QualityMode; label: string; description: string }> = [
  { value: 'draft', label: 'Draft', description: '< 200ms, quick preview' },
  { value: 'standard', label: 'Standard', description: '< 2s, playable, up to 20 candidates' },
  { value: 'polish', label: 'Polish', description: '< 10s, best quality' },
]

function fitViewportForEditorData(editorData: any): { x: number; y: number; zoom: number } {
  const points: Array<{ x: number; y: number }> = []
  for (const room of editorData.rooms ?? []) {
    points.push({ x: room.bounds.x, y: room.bounds.y })
    points.push({ x: room.bounds.x + room.bounds.width, y: room.bounds.y + room.bounds.height })
  }
  for (const corridor of editorData.corridors ?? []) {
    for (const segment of corridor.segments ?? []) {
      points.push(segment.start, segment.end)
    }
  }
  if (points.length === 0) return { x: 120, y: 80, zoom: 1 }

  const minX = Math.min(...points.map(p => p.x))
  const minY = Math.min(...points.map(p => p.y))
  const maxX = Math.max(...points.map(p => p.x))
  const maxY = Math.max(...points.map(p => p.y))
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const zoom = Math.max(0.2, Math.min(1, 788 / width, 528 / height))

  return {
    x: Math.round((980 - width * zoom) / 2 - minX * zoom),
    y: Math.round((720 - height * zoom) / 2 - minY * zoom),
    zoom: Number(zoom.toFixed(2)),
  }
}

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
  const [useQualityPipeline, setUseQualityPipeline] = useState(false) // Disabled by default to use new grid generator

  // Generator engine
  const [generatorEngine, setGeneratorEngine] = useState<'grid' | 'legacy'>('grid')

  // Advanced routing options
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [coalesceEnabled, setCoalesceEnabled] = useState(DEFAULT_COALESCE_SETTINGS.enabled)
  const [bendPenalty, setBendPenalty] = useState(DEFAULT_ROUTING_COSTS.bendPenalty)
  const [reuseBonus, setReuseBonus] = useState(DEFAULT_ROUTING_COSTS.reuseBonus)
  const [crossingPenalty, setCrossingPenalty] = useState(DEFAULT_ROUTING_COSTS.crossingPenalty)

  // Gallery mode - generate multiple variants
  const [galleryMode, setGalleryMode] = useState(false)
  const [variantCount, setVariantCount] = useState(4)
  const [variants, setVariants] = useState<Array<{
    candidateIndex: number
    seed: string
    score: number
    hardPass: boolean
    paretoRank: number
    hardIssues: string[]
    objectives?: CandidateSelectionObjectives
    roomCount: number
    corridorCount: number
    map: MapJSON
    data: ReturnType<typeof convertToEditorFormat> | null
  }>>([])
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null)

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

  // 3-tier parameter disclosure
  const [showLevel2, setShowLevel2] = useState(false)

  // Seed history (persist in localStorage)
  const [seedHistory, setSeedHistory] = useState<Array<{
    seed: string
    archetype: Archetype
    roomCount: number
    timestamp: number
  }>>(() => {
    try {
      const saved = localStorage.getItem('scifi-map-seed-history')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  // Preview mode: generate but don't apply yet
  const [previewData, setPreviewData] = useState<{
    project: any
    seed: string
    roomCount: number
    corridorCount: number
    diagnostics: {
      connectedRoomPercent?: number
      isolatedRooms?: number
      junctionCount?: number
      deadEndRatio?: number
      aestheticStatus?: 'pass' | 'warning' | 'error'
      aestheticViolationCodes?: string[]
      hullUtilizationPercent?: number
      corridorTurnRatio?: number
      clusteredJunctionPairs?: number
      ambiguousDoorCount?: number
      doorMetadataMismatchCount?: number
      candidateSelection?: CandidateSelectionSummary
      facilityStructureStatus?: 'pass' | 'warning' | 'error'
      facilityStructureViolationCodes?: string[]
      silhouetteFitScore?: number
      hullSymmetryPercent?: number
      structuralVoidCount?: number
      pressureStatus?: 'pass' | 'warning' | 'error'
      pressureViolationCodes?: string[]
      airlockRoomCount?: number
      validAirlockRoomCount?: number
      unresolvedExteriorHatchCount?: number
      exteriorHatchCount?: number
      pressureCompartmentCount?: number
      interlockGroupCount?: number
      invalidInterlockGroupCount?: number
    }
    viewport: { x: number; y: number; zoom: number }
  } | null>(null)

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

  // Save seed to history
  const addToSeedHistory = useCallback((seedVal: string, roomCount: number) => {
    setSeedHistory(prev => {
      const entry = { seed: seedVal, archetype, roomCount, timestamp: Date.now() }
      const updated = [entry, ...prev.filter(h => h.seed !== seedVal)].slice(0, 10)
      try { localStorage.setItem('scifi-map-seed-history', JSON.stringify(updated)) } catch {}
      return updated
    })
  }, [archetype])

  // Apply preview to editor
  const handleApplyPreview = useCallback(() => {
    if (!previewData) return
    dispatch(actions.loadProject(previewData.project))
    dispatch(actions.setViewport(previewData.viewport))
    addToSeedHistory(previewData.seed, previewData.roomCount)
    setPreviewData(null)
    onClose()
  }, [previewData, dispatch, onClose, addToSeedHistory])

  const handleDiscardPreview = useCallback(() => {
    setPreviewData(null)
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
    
    // Capture routing options for use in callback
    const routingOptions = {
      coalesceEnabled,
      bendPenalty,
      reuseBonus,
      crossingPenalty,
    }

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
                editorData = convertToEditorFormat(md, 0, routingOptions);
                name = md.meta.name;
                description = `${md.meta.archetype} - ${md.meta.subtype}`;
                metaData = {
                  generator: 'quality-pipeline',
                  seed: useSeed,
                  archetype, subtype, qualityMode,
                  candidatesEvaluated: mapData.candidatesEvaluated,
                  score: mapData.bestCandidate.score,
                  ttrpgMetrics: md.meta.ttrpgMetrics
                };
              } else {
                // Fallback if mapData missing
                throw new Error("Quality pipeline result missing map data");
              }

            } else { // Standard MapJSON
              editorData = convertToEditorFormat(mapData, 0, routingOptions);
              name = mapData.meta.name;
              description = `${mapData.meta.archetype} - ${mapData.meta.subtype}`;
              metaData = {
                generator: 'procedural',
                seed: mapData.meta.seed,
                masterSeed: mapData.meta.candidateSelection?.masterSeed ?? useSeed,
                archetype, subtype,
                candidatesEvaluated: mapData.meta.candidateSelection?.evaluatedCandidates ?? 1,
                candidateSelection: mapData.meta.candidateSelection,
                ttrpgMetrics: mapData.meta.ttrpgMetrics
              };
            }

            const newDeck = {
              id: crypto.randomUUID(),
              name: 'Deck 1',
              level: 1,
              rooms: editorData.rooms,
              corridors: editorData.corridors,
              junctions: editorData.junctions ?? [],
              geometry: editorData.geometry,
              pressure: editorData.pressure,
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

            // Preview mode: show result before applying
            setPreviewData({
              project: newProject,
              seed: metaData.seed,
              roomCount: editorData.rooms.length,
              corridorCount: editorData.corridors.length,
              diagnostics: {
                connectedRoomPercent: metaData.ttrpgMetrics?.connectedRoomPercent,
                isolatedRooms: metaData.ttrpgMetrics?.isolatedRooms,
                junctionCount: metaData.ttrpgMetrics?.junctionCount,
                deadEndRatio: metaData.ttrpgMetrics?.deadEndRatio,
                aestheticStatus: metaData.ttrpgMetrics?.aestheticStatus,
                aestheticViolationCodes: metaData.ttrpgMetrics?.aestheticViolationCodes,
                hullUtilizationPercent: metaData.ttrpgMetrics?.hullUtilizationPercent,
                corridorTurnRatio: metaData.ttrpgMetrics?.corridorTurnRatio,
                clusteredJunctionPairs: metaData.ttrpgMetrics?.clusteredJunctionPairs,
                ambiguousDoorCount: metaData.ttrpgMetrics?.ambiguousDoorCount,
                doorMetadataMismatchCount: metaData.ttrpgMetrics?.doorMetadataMismatchCount,
                candidateSelection: metaData.candidateSelection,
                facilityStructureStatus: metaData.ttrpgMetrics?.facilityStructureStatus,
                facilityStructureViolationCodes: metaData.ttrpgMetrics?.facilityStructureViolationCodes,
                silhouetteFitScore: metaData.ttrpgMetrics?.silhouetteFitScore,
                hullSymmetryPercent: metaData.ttrpgMetrics?.hullSymmetryPercent,
                structuralVoidCount: metaData.ttrpgMetrics?.structuralVoidCount,
                pressureStatus: metaData.ttrpgMetrics?.pressureStatus,
                pressureViolationCodes: metaData.ttrpgMetrics?.pressureViolationCodes,
                airlockRoomCount: metaData.ttrpgMetrics?.airlockRoomCount,
                validAirlockRoomCount: metaData.ttrpgMetrics?.validAirlockRoomCount,
                exteriorHatchCount: metaData.ttrpgMetrics?.exteriorHatchCount,
                pressureCompartmentCount: metaData.ttrpgMetrics?.pressureCompartmentCount,
                interlockGroupCount: metaData.ttrpgMetrics?.interlockGroupCount,
                invalidInterlockGroupCount: metaData.ttrpgMetrics?.invalidInterlockGroupCount,
                unresolvedExteriorHatchCount: metaData.ttrpgMetrics?.unresolvedExteriorHatchCount,
              },
              viewport: fitViewportForEditorData(editorData),
            })
            addToSeedHistory(useSeed, editorData.rooms.length)

            setGenState({
              isGenerating: false,
              lastSeed: useSeed,
              lastTiming: null,
              error: null,
              progress: 100,
              candidatesEvaluated: metaData.candidatesEvaluated || 0,
              qualityPhase: null,
            })
            setPlainStatus(null)

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
          qualityMode,
          engine: generatorEngine,
          routing: {
            coalesceEnabled,
            bendPenalty,
            reuseBonus,
            crossingPenalty,
          }
        }
      });

    } catch (error: any) {
      setGenState(s => ({ ...s, isGenerating: false, error: error.message }));
    }

  }, [seed, archetype, subtype, sizeTier, styleProfile, loopiness, danger, useQualityPipeline, qualityMode, generatorEngine, coalesceEnabled, bendPenalty, reuseBonus, crossingPenalty, dispatch, onClose, generateRandomSeed, addToSeedHistory])

  const handleCancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'CANCEL' });
    }
    setGenState(s => ({ ...s, isGenerating: false, error: 'Cancelled' }));
  }, []);

  // Generate multiple raw variants, then rank them with the same evaluator as standard generation.
  const handleGenerateGallery = useCallback(async () => {
    setVariants([])
    setSelectedVariant(null)
    setPreviewData(null)
    setGenState(s => ({ ...s, isGenerating: true, error: null, progress: 0 }))

    const routingOptions = { coalesceEnabled, bendPenalty, reuseBonus, crossingPenalty }
    const newVariants: typeof variants = []
    const masterSeed = seed.trim() || generateRandomSeed()

    // Use setTimeout to yield to UI thread between generations.
    const generateVariant = (index: number): Promise<void> => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const variantSeed = deriveGridCandidateSeed(masterSeed, index)

          try {
            const options: GeneratorOptions = {
              seed: variantSeed,
              archetype,
              subtype,
              sizeTier,
              styleProfile,
              loopiness,
              danger,
              qualityProfile: 'draft',
              routing: routingOptions,
            }

            const result = generateMap(options)
            if (!result.success || !result.map) {
              throw new Error(result.issues.map(issue => issue.message).join(', ') || 'Generation failed')
            }

            const editorData = convertToEditorFormat(result.map, 0, routingOptions)
            const roomCount = editorData.rooms.length
            const corridorCount = editorData.corridors.length

            newVariants.push({
              candidateIndex: index,
              seed: variantSeed,
              score: 0,
              hardPass: true,
              paretoRank: 0,
              hardIssues: [],
              roomCount,
              corridorCount,
              map: result.map,
              data: editorData,
            })
          } catch (err: any) {
            console.warn(`Variant ${index + 1} failed:`, err.message)
          }

          setGenState(s => ({ ...s, progress: ((index + 1) / variantCount) * 100 }))
          resolve()
        }, 10)
      })
    }

    for (let index = 0; index < variantCount; index++) {
      await generateVariant(index)
    }

    const evaluations = rankGridCandidates(newVariants.map(variant => ({
      index: variant.candidateIndex,
      seed: variant.seed,
      map: variant.map,
    })), { archetype, sizeTier, loopiness })
    const variantsByIndex = new Map(newVariants.map(variant => [variant.candidateIndex, variant]))
    const rankedVariants = evaluations.map(evaluation => ({
      ...variantsByIndex.get(evaluation.index)!,
      score: evaluation.balancedScore,
      hardPass: evaluation.hardPass,
      paretoRank: evaluation.paretoRank,
      hardIssues: evaluation.hardIssues,
      objectives: evaluation.objectives,
    }))

    setVariants(rankedVariants)
    setGenState(s => ({ ...s, isGenerating: false, progress: 100 }))
  }, [seed, archetype, subtype, sizeTier, styleProfile, loopiness, danger, variantCount, coalesceEnabled, bendPenalty, reuseBonus, crossingPenalty, generateRandomSeed])

  // Apply selected variant
  const handleApplyVariant = useCallback((index: number) => {
    const variant = variants[index]
    if (!variant?.data || !variant.hardPass) return

    const config = ARCHETYPE_CONFIGS[archetype]
    const name = `${config.label} (${variant.seed})`

    const newDeck = {
      id: crypto.randomUUID(),
      name: 'Deck 1',
      level: 1,
      rooms: variant.data.rooms,
      corridors: variant.data.corridors,
      junctions: variant.data.junctions ?? [],
      geometry: variant.data.geometry,
    }

    const newProject = {
      id: crypto.randomUUID(),
      name,
      description: `Generated ${archetype} - Variant ${index + 1}`,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      gridSize: 40,
      decks: [newDeck],
      layers: [...DEFAULT_LAYERS],
      theme: MAP_THEMES[MapThemeId.Blueprint],
      metadata: { seed: variant.seed, score: variant.score },
    }

    dispatch(actions.loadProject(newProject))
    dispatch(actions.setViewport(fitViewportForEditorData(variant.data)))
    setGenState(s => ({ ...s, lastSeed: variant.seed }))
    onClose()
  }, [variants, archetype, dispatch, onClose])


  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="panel w-[720px] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="panel-header flex items-center justify-between">
          <span>Map Generator</span>
          <button onClick={onClose} className="text-space-400 hover:text-white">
            X
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-4 space-y-3">
            {/* ============ TIER 1: Essential Parameters ============ */}

            {/* Seed Input + History */}
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
              {/* Seed history */}
              {seedHistory.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  <span className="text-xs text-space-500">History:</span>
                  {seedHistory.slice(0, 5).map(h => (
                    <button
                      key={h.seed}
                      onClick={() => setSeed(h.seed)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        seed === h.seed
                          ? 'bg-space-700 border-cyber-blue text-cyber-blue'
                          : 'bg-space-800 border-space-700 text-space-400 hover:border-space-500'
                      }`}
                      title={`${h.archetype} / ${h.roomCount} rooms`}
                    >
                      {h.seed}
                    </button>
                  ))}
                </div>
              )}
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

                {showLevel2 && (
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
                )}
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

                {/* ============ TIER 2: Secondary Parameters ============ */}
                {showLevel2 && (
                  <>
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

                    {/* Gallery Mode Toggle */}
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={galleryMode}
                          onChange={e => setGalleryMode(e.target.checked)}
                          className="w-4 h-4 accent-cyber-blue"
                        />
                        <span className="text-sm text-space-200">Gallery mode</span>
                      </label>
                      {galleryMode && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-space-400">Variants:</span>
                          {[2, 4, 6, 8].map(n => (
                            <button
                              key={n}
                              onClick={() => setVariantCount(n)}
                              className={`px-2 py-1 text-xs rounded ${variantCount === n
                                ? 'bg-cyber-blue text-white'
                                : 'bg-space-700 text-space-300 hover:bg-space-600'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-space-500">
                        {galleryMode ? `Generate ${variantCount} variants to compare` : 'Generate single map'}
                      </p>
                    </div>
                  </>
                )}

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
                {showLevel2 && (
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
                )}
              </div>
            </div>

            {/* Tier 2 toggle */}
            <button
              onClick={() => setShowLevel2(!showLevel2)}
              className="w-full py-2 px-3 text-sm text-left text-space-400 hover:text-space-200 border border-space-700 rounded hover:border-space-600 transition-colors flex justify-between items-center"
            >
              <span>{showLevel2 ? 'Less options' : 'More options (style, danger, gallery...)'}</span>
              <span className="text-xs">{showLevel2 ? '^' : 'v'}</span>
            </button>

            {/* Tier 3: Advanced corridor settings */}
            {showLevel2 && (
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full py-2 px-3 text-sm text-left text-space-400 hover:text-space-200 border border-space-700 rounded hover:border-space-600 transition-colors flex justify-between items-center"
              >
                <span>Advanced corridor settings</span>
                <span className="text-xs">{showAdvanced ? '^' : 'v'}</span>
              </button>
            )}

            {/* Advanced Routing Options (Tier 3) */}
            {showLevel2 && showAdvanced && generatorEngine === 'grid' && !useQualityPipeline && (
              <div className="p-3 bg-space-800/50 rounded border border-space-700 text-xs text-space-400">
                Grid engine now uses corridor graph defaults. Legacy routing sliders are hidden because they do not affect this engine.
              </div>
            )}
            {showLevel2 && showAdvanced && (generatorEngine === 'legacy' || useQualityPipeline) && (
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
            {genState.isGenerating && !useQualityPipeline && !galleryMode && (
              <div className="p-3 bg-space-800 border border-cyber-blue/30 rounded space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-cyber-blue rounded-full animate-pulse" />
                    <span className="text-space-200 font-medium">{plainStatus || 'Generating...'}</span>
                  </div>
                  <span className="text-cyber-blue font-mono text-sm">{genState.progress.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-space-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyber-blue via-cyber-purple to-cyber-pink transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(10, genState.progress)}%` }}
                  />
                </div>
                {/* Stage indicators */}
                <div className="flex justify-between text-xs text-space-500">
                  <span className={genState.progress >= 15 ? 'text-cyber-blue' : ''}>Hull</span>
                  <span className={genState.progress >= 30 ? 'text-cyber-blue' : ''}>Zones</span>
                  <span className={genState.progress >= 45 ? 'text-cyber-blue' : ''}>Rooms</span>
                  <span className={genState.progress >= 60 ? 'text-cyber-blue' : ''}>Corridors</span>
                  <span className={genState.progress >= 85 ? 'text-cyber-blue' : ''}>Doors</span>
                  <span className={genState.progress >= 95 ? 'text-cyber-blue' : ''}>Done</span>
                </div>
              </div>
            )}

            {/* Gallery mode progress */}
            {genState.isGenerating && galleryMode && (
              <div className="p-3 bg-space-800 border border-space-600 rounded space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-space-300">
                    Generating variant {Math.ceil(genState.progress / 100 * variantCount)} of {variantCount}...
                  </span>
                  <span className="text-cyber-blue font-mono">
                    {genState.progress.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-space-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyber-purple to-cyber-pink transition-all duration-300"
                    style={{ width: `${genState.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-space-500">
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-cyber-blue rounded-full animate-pulse" />
                    Please wait...
                  </span>
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
            {genState.lastSeed && !genState.error && !genState.isGenerating && !galleryMode && (
              <div className="p-3 bg-green-900/30 border border-green-700 rounded text-green-400 text-sm">
                Done! Seed: <span className="font-mono">{genState.lastSeed}</span>
                {genState.lastTiming !== null && genState.lastTiming > 0 && (
                  <span className="text-green-500 ml-2">({genState.lastTiming.toFixed(0)}ms)</span>
                )}
              </div>
            )}

            {/* Gallery of Variants */}
            {galleryMode && variants.length > 0 && !genState.isGenerating && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-space-200">
                    Generated Variants ({variants.length})
                  </h3>
                  <span className="text-xs text-space-400">Click to select, double-click to apply</span>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {variants.map((v, i) => (
                    <div
                      key={v.seed}
                      onClick={() => v.hardPass && setSelectedVariant(i)}
                      onDoubleClick={() => handleApplyVariant(i)}
                      className={`p-3 rounded border cursor-pointer transition-all ${
                        selectedVariant === i
                          ? 'bg-space-700 border-cyber-blue'
                          : 'bg-space-800 border-space-600 hover:border-space-500'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-mono text-cyber-blue">{v.seed}</span>
                        {v.hardPass ? (
                          i === 0 && (
                            <span className="text-[10px] bg-cyber-green/20 text-cyber-green px-1 rounded">
                              Best valid
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] bg-red-500/20 text-red-300 px-1 rounded">
                            Rejected
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-space-300">
                        {v.roomCount} rooms, {v.corridorCount} corridors
                      </div>
                      <div className="text-xs text-space-500">
                        {generatorEngine === 'grid' ? 'Quality' : 'Score'}: {generatorEngine === 'grid'
                          ? `${(v.score * 100).toFixed(0)}% · Pareto ${v.paretoRank + 1}`
                          : v.score.toFixed(2)}
                      </div>
                      {v.objectives && (
                        <div className="mt-1 text-[10px] text-space-500">
                          Route {(v.objectives.routeClarity * 100).toFixed(0)} · Hull {(v.objectives.hullUseFit * 100).toFixed(0)} · TTRPG {(v.objectives.ttrpgChoice * 100).toFixed(0)}
                        </div>
                      )}
                      {!v.hardPass && (
                        <div className="mt-1 text-[10px] text-red-300">
                          {v.hardIssues.join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {selectedVariant !== null && variants[selectedVariant]?.hardPass && (
                  <button
                    onClick={() => handleApplyVariant(selectedVariant)}
                    className="w-full btn btn-cyber"
                  >
                    Apply Variant {selectedVariant + 1}
                  </button>
                )}
              </div>
            )}
            {/* Preview Result */}
            {previewData && !genState.isGenerating && (
              <div className="p-3 bg-space-800 border border-cyber-blue/40 rounded space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-cyber-blue">Preview Ready</span>
                  <span className="text-xs font-mono text-space-400">{previewData.seed}</span>
                </div>
                <div className="text-xs text-space-300">
                  {previewData.roomCount} rooms, {previewData.corridorCount} corridors
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-space-400">
                  <span>Connected: {previewData.diagnostics.connectedRoomPercent ?? '?'}%</span>
                  <span>Isolated: {previewData.diagnostics.isolatedRooms ?? '?'}</span>
                  <span>Junctions: {previewData.diagnostics.junctionCount ?? '?'}</span>
                  <span>Dead ends: {previewData.diagnostics.deadEndRatio ?? '?'}</span>
                </div>
                {previewData.diagnostics.candidateSelection && (
                  <div className="rounded border border-cyber-blue/40 bg-cyber-blue/10 p-2 text-[11px] text-space-300">
                    <div className="flex items-center justify-between font-medium text-cyber-blue">
                      <span>Candidate selection</span>
                      <span>
                        {previewData.diagnostics.candidateSelection.passedCandidates}/{previewData.diagnostics.candidateSelection.evaluatedCandidates} valid
                      </span>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-1 text-space-400">
                      <span>Route {(previewData.diagnostics.candidateSelection.objectives.routeClarity * 100).toFixed(0)}</span>
                      <span>Hull {(previewData.diagnostics.candidateSelection.objectives.hullUseFit * 100).toFixed(0)}</span>
                      <span>TTRPG {(previewData.diagnostics.candidateSelection.objectives.ttrpgChoice * 100).toFixed(0)}</span>
                    </div>
                    <div className="mt-1 text-space-500">
                      Pareto {previewData.diagnostics.candidateSelection.paretoRank + 1} · candidate #{previewData.diagnostics.candidateSelection.selectedIndex + 1}
                    </div>
                  </div>
                )}
                {previewData.diagnostics.facilityStructureStatus && (
                  <div className={`rounded border p-2 text-[11px] ${
                    previewData.diagnostics.facilityStructureStatus === 'pass'
                      ? 'border-green-500/40 bg-green-500/10 text-green-300'
                      : previewData.diagnostics.facilityStructureStatus === 'error'
                        ? 'border-red-500/50 bg-red-500/10 text-red-300'
                        : 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                  }`}>
                    <div className="flex items-center justify-between font-medium">
                      <span>Facility structure</span>
                      <span className="uppercase">
                        {previewData.diagnostics.facilityStructureStatus}
                      </span>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-x-2 text-space-300">
                      <span>Silhouette: {previewData.diagnostics.silhouetteFitScore ?? '?'}</span>
                      <span>Symmetry: {previewData.diagnostics.hullSymmetryPercent ?? '?'}%</span>
                      <span>Voids: {previewData.diagnostics.structuralVoidCount ?? '?'}</span>
                    </div>
                    {(previewData.diagnostics.facilityStructureViolationCodes?.length ?? 0) > 0 && (
                      <div className="mt-1 text-space-400">
                        {previewData.diagnostics.facilityStructureViolationCodes?.join(' / ')}
                      </div>
                    )}
                  </div>
                )}
                {previewData.diagnostics.pressureStatus && (
                  <div className={`rounded border p-2 text-[11px] ${
                    previewData.diagnostics.pressureStatus === 'pass'
                      ? 'border-green-500/40 bg-green-500/10 text-green-300'
                      : previewData.diagnostics.pressureStatus === 'error'
                        ? 'border-red-500/50 bg-red-500/10 text-red-300'
                        : 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                  }`}>
                    <div className="flex items-center justify-between font-medium">
                      <span>Airlock topology</span>
                      <span className="uppercase">{previewData.diagnostics.pressureStatus}</span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-2 text-space-300">
                      <span>
                        Airlocks: {previewData.diagnostics.validAirlockRoomCount ?? '?'}/{previewData.diagnostics.airlockRoomCount ?? '?'} valid
                      </span>
                      <span>
                        Exterior hatches: {previewData.diagnostics.exteriorHatchCount ?? '?'}
                      </span>
                      <span>Compartments: {previewData.diagnostics.pressureCompartmentCount ?? '?'}</span>
                      <span>Interlocks: {previewData.diagnostics.interlockGroupCount ?? '?'}</span>
                    </div>
                    {(previewData.diagnostics.unresolvedExteriorHatchCount ?? 0) > 0 && (
                      <div className="mt-1">Unresolved exterior hatches: {previewData.diagnostics.unresolvedExteriorHatchCount}</div>
                    )}
                    {(previewData.diagnostics.pressureViolationCodes?.length ?? 0) > 0 && (
                      <div className="mt-1 text-space-400">
                        {previewData.diagnostics.pressureViolationCodes?.join(' / ')}
                      </div>
                    )}
                  </div>
                )}
                {previewData.diagnostics.aestheticStatus && (
                  <div className={`rounded border p-2 text-[11px] ${
                    previewData.diagnostics.aestheticStatus === 'pass'
                      ? 'border-green-500/40 bg-green-500/10 text-green-300'
                      : previewData.diagnostics.aestheticStatus === 'error'
                        ? 'border-red-500/50 bg-red-500/10 text-red-300'
                        : 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                  }`}>
                    <div className="flex items-center justify-between font-medium">
                      <span>Automatic visual review</span>
                      <span className="uppercase">{previewData.diagnostics.aestheticStatus}</span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-2 text-space-300">
                      <span>Hull use: {previewData.diagnostics.hullUtilizationPercent ?? '?'}%</span>
                      <span>Turn ratio: {previewData.diagnostics.corridorTurnRatio ?? '?'}</span>
                      <span>Close junctions: {previewData.diagnostics.clusteredJunctionPairs ?? '?'}</span>
                      <span>Unclear doors: {previewData.diagnostics.ambiguousDoorCount ?? '?'}</span>
                    </div>
                    {(previewData.diagnostics.aestheticViolationCodes?.length ?? 0) > 0 && (
                      <div className="mt-1 text-space-400">
                        {previewData.diagnostics.aestheticViolationCodes?.join(' · ')}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleApplyPreview}
                    className="flex-1 btn btn-cyber"
                  >
                    Apply
                  </button>
                  <button
                    onClick={handleDiscardPreview}
                    className="btn btn-secondary"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleGenerate}
                    className="btn btn-secondary"
                    title="Generate with new random seed"
                  >
                    Reroll
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-space-700 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          {galleryMode ? (
            <button
              onClick={handleGenerateGallery}
              className="btn btn-cyber"
              disabled={genState.isGenerating}
            >
              {genState.isGenerating ? 'Generating...' : `Generate ${variantCount} Variants`}
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              className="btn btn-cyber"
              disabled={genState.isGenerating || !!previewData}
            >
              {genState.isGenerating ? 'Generating...' : 'Generate'}
            </button>
          )}
        </div>
      </div >
    </div >
  )
}

