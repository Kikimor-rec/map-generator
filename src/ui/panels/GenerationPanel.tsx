/**
 * Generation Panel
 * UI for configuring and running the procedural map generator
 */

import { useState, useCallback, useRef } from 'react'
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
  type StyleProfile
} from '@generators/index'
import {
  runQualityPipeline,
  type QualityMode,
  type RefinementUpdate,
  QUALITY_MODE_CONFIGS,
} from '@generators/quality'

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// CONSTANTS
// ============================================================================

const SIZE_TIERS: Array<{ value: SizeTier; label: string; description: string }> = [
  { value: 'xs', label: 'XS', description: '4-8 комнат' },
  { value: 'sm', label: 'S', description: '8-16 комнат' },
  { value: 'md', label: 'M', description: '16-32 комнат' },
  { value: 'lg', label: 'L', description: '32-64 комнат' },
  { value: 'xl', label: 'XL', description: '64-128 комнат' }
]

const STYLE_PROFILES: Array<{ value: StyleProfile; label: string }> = [
  { value: 'utilitarian', label: 'Утилитарный' },
  { value: 'military', label: 'Военный' },
  { value: 'luxury', label: 'Люкс' },
  { value: 'industrial', label: 'Индустриальный' },
  { value: 'organic', label: 'Органический' },
  { value: 'alien', label: 'Инопланетный' }
]

const QUALITY_MODES: Array<{ value: QualityMode; label: string; description: string }> = [
  { value: 'draft', label: 'Черновик', description: '< 200ms, быстрый preview' },
  { value: 'standard', label: 'Стандарт', description: '< 2s, играбельная карта' },
  { value: 'polish', label: 'Полировка', description: '< 10s, максимальное качество' }
]

// ============================================================================
// COMPONENT
// ============================================================================

export function GenerationPanel({ isOpen, onClose }: GenerationPanelProps) {
  const { state, dispatch } = useEditor()
  const { project } = state
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
    qualityPhase: null
  })

  // Get available subtypes for current archetype
  const availableSubtypes = ARCHETYPE_CONFIGS[archetype].subtypes

  // Update subtype when archetype changes
  const handleArchetypeChange = useCallback((newArchetype: Archetype) => {
    setArchetype(newArchetype)
    const subtypes = ARCHETYPE_CONFIGS[newArchetype].subtypes
    if (subtypes.length > 0) {
      setSubtype(subtypes[0].id as Subtype)
    }
  }, [])

  // Generate random seed
  const generateRandomSeed = useCallback(() => {
    const newSeed = Math.random().toString(36).substring(2, 10).toUpperCase()
    setSeed(newSeed)
    return newSeed
  }, [])

  // Run generation
  const handleGenerate = useCallback(async () => {
    setGenState(s => ({ 
      ...s, 
      isGenerating: true, 
      error: null,
      progress: 0,
      candidatesEvaluated: 0,
      qualityPhase: null
    }))

    // Use provided seed or generate random
    const useSeed = seed.trim() || generateRandomSeed()

    const options: GeneratorOptions = {
      seed: useSeed,
      archetype,
      subtype,
      sizeTier,
      styleProfile,
      loopiness,
      danger
    }

    try {
      if (useQualityPipeline) {
        // Use quality pipeline
        const abortController = new AbortController()
        abortControllerRef.current = abortController
        
        const onUpdate = (update: RefinementUpdate) => {
          setGenState(s => ({
            ...s,
            progress: update.progress * 100,
            candidatesEvaluated: update.candidatesEvaluated,
            qualityPhase: update.type
          }))
        }
        
        // Map style profile to quality style profile
        const qualityStyle = (styleProfile === 'realism' || styleProfile === 'futurism') 
          ? styleProfile 
          : undefined
        
        const pipelineOptions = {
          seed: useSeed,
          qualityMode: qualityMode,
          styleProfile: qualityStyle,
          mapParams: {
            archetype: archetype,
            subtype: subtype,
            sizeTier: sizeTier,
            gridSize: 40,
            loopiness: loopiness,
            danger: danger
          },
          refinement: {
            onUpdate,
            abortSignal: abortController.signal,
            maxUpdates: 10,
            minUpdateInterval: 100
          }
        }
        
        const pipelineResult = await runQualityPipeline(pipelineOptions)
        abortControllerRef.current = null
        
        // Convert pipeline result to map
        if (pipelineResult.bestCandidate?.data.mapData) {
          const mapData = pipelineResult.bestCandidate.data.mapData
          
          // Convert MapJSONCompat to editor format
          // Use type assertion since structures are compatible
          const editorData = convertToEditorFormat(mapData as unknown as Parameters<typeof convertToEditorFormat>[0], 0)

          const newDeck = {
            id: crypto.randomUUID(),
            name: `Deck 1`,
            level: 1,
            rooms: editorData.rooms,
            corridors: editorData.corridors
          }

          const newProject = {
            id: crypto.randomUUID(),
            name: mapData.meta.name,
            description: `${mapData.meta.archetype} - ${mapData.meta.subtype}`,
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            gridSize: 40,
            decks: [newDeck],
            layers: [...DEFAULT_LAYERS],
            theme: MAP_THEMES[MapThemeId.Blueprint],
            metadata: {
              generator: 'quality-pipeline',
              seed: useSeed,
              archetype: archetype,
              subtype: subtype,
              qualityMode: qualityMode,
              candidatesEvaluated: pipelineResult.candidatesEvaluated,
              score: pipelineResult.bestCandidate?.score
            }
          }

          dispatch(actions.loadProject(newProject))
          
          setGenState({
            isGenerating: false,
            lastSeed: useSeed,
            lastTiming: pipelineResult.totalTimeMs,
            error: null,
            progress: 100,
            candidatesEvaluated: pipelineResult.candidatesEvaluated,
            qualityPhase: null
          })
          
          onClose()
        } else {
          setGenState(s => ({
            ...s,
            isGenerating: false,
            error: `Не найдено валидных кандидатов (${pipelineResult.candidatesEvaluated} проверено)`,
            progress: 0,
            qualityPhase: null
          }))
        }
      } else {
        // Use standard generator
        const result = generateMap(options)

        if (result.success && result.map) {
          // Convert to editor format
          const editorData = convertToEditorFormat(result.map, 0)

          // Create new deck with generated rooms
          const newDeck = {
            id: crypto.randomUUID(),
            name: `Deck 1`,
            level: 1,
            rooms: editorData.rooms,
            corridors: editorData.corridors
          }

          // Create new project
          const newProject = {
            id: crypto.randomUUID(),
            name: result.map.meta.name,
            description: `${result.map.meta.archetype} - ${result.map.meta.subtype}`,
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            gridSize: 40,
            decks: [newDeck],
            layers: [...DEFAULT_LAYERS],
            theme: MAP_THEMES[MapThemeId.Blueprint],
            metadata: {
              generator: 'procedural',
              seed: useSeed,
              archetype: archetype,
              subtype: subtype
            }
          }

          dispatch(actions.loadProject(newProject))
          
          setGenState({
            isGenerating: false,
            lastSeed: useSeed,
            lastTiming: result.timing.total,
            error: null,
            progress: 100,
            candidatesEvaluated: 0,
            qualityPhase: null
          })
          
          onClose()
        } else {
          const errorMsg = result.issues
            .filter((i: { severity: string }) => i.severity === 'error')
            .map((i: { message: string }) => i.message)
            .join(', ') || 'Ошибка генерации'

          setGenState(s => ({
            ...s,
            isGenerating: false,
            error: errorMsg,
            progress: 0,
            qualityPhase: null
          }))
        }
      }
    } catch (err) {
      setGenState(s => ({
        ...s,
        isGenerating: false,
        error: err instanceof Error ? err.message : 'Неизвестная ошибка',
        progress: 0,
        qualityPhase: null
      }))
    }
  }, [archetype, subtype, sizeTier, styleProfile, loopiness, danger, seed, dispatch, generateRandomSeed, onClose, project, useQualityPipeline, qualityMode])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="panel w-[500px] max-h-[80vh] overflow-hidden flex flex-col">
        <div className="panel-header flex items-center justify-between">
          <span>✨ Генератор карт</span>
          <button onClick={onClose} className="text-space-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Seed Input */}
          <div className="space-y-1">
            <label className="label">Seed</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={seed}
                onChange={e => setSeed(e.target.value.toUpperCase())}
                placeholder="Случайный"
                className="input flex-1"
              />
              <button
                onClick={generateRandomSeed}
                className="btn btn-secondary"
                title="Случайный seed"
              >
                🎲
              </button>
            </div>
          </div>

          {/* Archetype Selection */}
          <div className="space-y-1">
            <label className="label">Архетип</label>
            <div className="grid grid-cols-3 gap-2">
              {(['ship', 'station', 'outpost'] as Archetype[]).map(arch => (
                <button
                  key={arch}
                  onClick={() => handleArchetypeChange(arch)}
                  className={`px-3 py-2 rounded text-sm font-medium border transition-all ${
                    archetype === arch
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
            <label className="label">Подтип</label>
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

          {/* Size Tier */}
          <div className="space-y-1">
            <label className="label">Размер</label>
            <div className="grid grid-cols-5 gap-1">
              {SIZE_TIERS.map(tier => (
                <button
                  key={tier.value}
                  onClick={() => setSizeTier(tier.value)}
                  className={`px-2 py-2 rounded text-sm font-medium border transition-all ${
                    sizeTier === tier.value
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

          {/* Style Profile */}
          <div className="space-y-1">
            <label className="label">Стиль</label>
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

          {/* Quality Mode */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="label">Режим качества</label>
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
                      className={`px-2 py-2 rounded text-sm font-medium border transition-all ${
                        qualityMode === qm.value
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
                  {QUALITY_MODES.find(q => q.value === qualityMode)?.description}
                  {' • '}
                  до {QUALITY_MODE_CONFIGS[qualityMode].maxCandidates} кандидатов
                </p>
              </>
            )}
          </div>

          {/* Loopiness Slider */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="label">Связность</label>
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
              <span>Линейная</span>
              <span>Лабиринт</span>
            </div>
          </div>

          {/* Danger Slider */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="label">Опасность</label>
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
              <span>Безопасно</span>
              <span>Опасно</span>
            </div>
          </div>

          {/* Advanced Options Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full py-2 px-3 text-sm text-left text-space-400 hover:text-space-200 border border-space-700 rounded hover:border-space-600 transition-colors flex justify-between items-center"
          >
            <span>⚙️ Расширенные настройки коридоров</span>
            <span>{showAdvanced ? '▼' : '▶'}</span>
          </button>

          {/* Advanced Routing Options */}
          {showAdvanced && (
            <div className="space-y-3 p-3 bg-space-800/50 rounded border border-space-700">
              {/* Coalesce Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={coalesceEnabled}
                  onChange={e => setCoalesceEnabled(e.target.checked)}
                  className="w-4 h-4 accent-cyber-blue"
                />
                <span className="text-sm text-space-200">Объединять коридоры (Coalesce)</span>
              </label>
              <p className="text-xs text-space-500 -mt-2 ml-6">
                Автоматическое слияние дублирующихся сегментов
              </p>

              {/* Bend Penalty */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-xs text-space-400">Штраф за повороты</label>
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

              {/* Reuse Bonus */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-xs text-space-400">Бонус переиспользования</label>
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
                  <span>Сильный</span>
                  <span>Отключен</span>
                </div>
              </div>

              {/* Crossing Penalty */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-xs text-space-400">Штраф пересечений</label>
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
            <div className="text-space-400 mb-2">Превью генерации:</div>
            <div className="text-space-200">
              <strong>{ARCHETYPE_CONFIGS[archetype].label}</strong> — {availableSubtypes.find(s => s.id === subtype)?.label}
              <br />
              <span className="text-xs text-space-400">
                Размер: {SIZE_TIERS.find(t => t.value === sizeTier)?.description} • 
                Связность: {Math.round(loopiness * 100)}%
              </span>
            </div>
          </div>

          {/* Error */}
          {genState.error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
              {genState.error}
            </div>
          )}

          {/* Quality Pipeline Progress */}
          {genState.isGenerating && useQualityPipeline && (
            <div className="p-3 bg-space-800 border border-space-600 rounded space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-space-300">
                  {genState.qualityPhase === 'draft' && '🔍 Поиск кандидатов...'}
                  {genState.qualityPhase === 'improved' && '⚙️ Улучшение...'}
                  {genState.qualityPhase === 'final' && '✨ Финализация...'}
                  {!genState.qualityPhase && '🚀 Запуск...'}
                </span>
                <span className="text-cyber-blue font-mono">
                  {genState.candidatesEvaluated} кандидатов
                </span>
              </div>
              <div className="h-2 bg-space-700 rounded overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyber-blue to-cyber-pink transition-all duration-300"
                  style={{ width: `${genState.progress}%` }}
                />
              </div>
              <div className="text-xs text-space-400 text-center">
                {genState.progress.toFixed(0)}% • {QUALITY_MODES.find(q => q.value === qualityMode)?.label}
              </div>
            </div>
          )}

          {/* Success info */}
          {genState.lastSeed && !genState.error && (
            <div className="p-3 bg-green-900/30 border border-green-700 rounded text-green-400 text-sm">
              Сгенерировано! Seed: <span className="font-mono">{genState.lastSeed}</span>
              {genState.lastTiming && (
                <span className="text-green-500 ml-2">
                  ({genState.lastTiming.toFixed(0)}ms)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-space-700 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            Отмена
          </button>
          <button 
            onClick={handleGenerate} 
            className="btn btn-cyber"
            disabled={genState.isGenerating}
          >
            {genState.isGenerating ? '⏳ Генерация...' : '✨ Сгенерировать'}
          </button>
        </div>
      </div>
    </div>
  )
}
