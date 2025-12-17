/**
 * Diagnostics Panel
 * 
 * Debug overlay showing quality metrics and pipeline diagnostics.
 * Used for development and debugging the quality pipeline.
 */

import React from 'react'
import type { PipelineDiagnostics, ScoreBreakdown } from '../../generators/quality'

interface DiagnosticsPanelProps {
  isOpen: boolean
  onClose: () => void
  diagnostics?: PipelineDiagnostics | null
  scoreBreakdown?: ScoreBreakdown | null
  candidatesEvaluated?: number
  totalTimeMs?: number
  qualityMode?: string
}

export function DiagnosticsPanel({
  isOpen,
  onClose,
  diagnostics,
  scoreBreakdown,
  candidatesEvaluated = 0,
  totalTimeMs = 0,
  qualityMode = 'standard'
}: DiagnosticsPanelProps) {
  if (!isOpen) return null

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-space-900 border border-space-600 rounded-lg shadow-xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-space-700 bg-space-800">
        <span className="text-sm font-medium text-cyber-blue">🔬 Quality Diagnostics</span>
        <button 
          onClick={onClose}
          className="text-space-400 hover:text-white text-sm"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3 max-h-96 overflow-y-auto text-xs">
        {/* Generation Info */}
        <Section title="Генерация">
          <Stat label="Режим" value={qualityMode} />
          <Stat label="Кандидатов" value={candidatesEvaluated} />
          <Stat label="Время" value={`${totalTimeMs.toFixed(0)}ms`} />
        </Section>

        {/* Score Breakdown */}
        {scoreBreakdown && (
          <Section title="Оценка качества">
            <Stat 
              label="Общая оценка" 
              value={scoreBreakdown.total.toFixed(1)} 
              highlight={scoreBreakdown.total > 80}
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
              <Stat label="Длина" value={scoreBreakdown.components.corridorLength?.toFixed(1) ?? '-'} mini />
              <Stat label="Изгибы" value={scoreBreakdown.components.bends?.toFixed(1) ?? '-'} mini />
              <Stat label="Тупики" value={scoreBreakdown.components.deadEnds?.toFixed(1) ?? '-'} mini />
              <Stat label="Циклы" value={scoreBreakdown.components.cycles?.toFixed(1) ?? '-'} mini />
              <Stat label="Узкие места" value={scoreBreakdown.components.chokepoints?.toFixed(1) ?? '-'} mini />
              <Stat label="Узлы" value={scoreBreakdown.components.junctionDegree?.toFixed(1) ?? '-'} mini />
              <Stat label="Повторы" value={scoreBreakdown.components.reuse?.toFixed(1) ?? '-'} mini />
              <Stat label="Компактность" value={scoreBreakdown.components.compactness?.toFixed(1) ?? '-'} mini />
            </div>
          </Section>
        )}

        {/* Diagnostics */}
        {diagnostics && (
          <Section title="Валидация">
            <Stat 
              label="Перекрытия комнат" 
              value={diagnostics.overlaps} 
              isError={diagnostics.overlaps > 0}
            />
            <Stat 
              label="Коридоры в комнатах" 
              value={diagnostics.corridorRoomIntersections}
              isError={diagnostics.corridorRoomIntersections > 0}
            />
            <Stat label="Микросегменты" value={diagnostics.microSegmentCount} />
          </Section>
        )}

        {/* Layout Metrics */}
        {diagnostics && (
          <Section title="Метрики">
            <Stat label="Длина коридоров" value={`${diagnostics.totalCorridorLength.toFixed(0)}px`} />
            <Stat label="Изгибов" value={diagnostics.totalBends} />
            <Stat label="Циклов" value={diagnostics.cycleCount} />
            <Stat label="Узких мест" value={diagnostics.chokepointCount} />
          </Section>
        )}

        {/* Junction Distribution */}
        {diagnostics && diagnostics.junctionDegreeDistribution && (
          <Section title="Распределение узлов">
            <div className="flex gap-2 flex-wrap">
              {Object.entries(diagnostics.junctionDegreeDistribution).map(([degree, count]) => (
                <span 
                  key={degree}
                  className="px-2 py-0.5 bg-space-800 rounded text-space-300"
                >
                  {degree}-way: {count as number}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* No Data */}
        {!diagnostics && !scoreBreakdown && (
          <div className="text-center text-space-500 py-4">
            Нет данных диагностики.
            <br />
            Сгенерируйте карту через Quality Pipeline.
          </div>
        )}
      </div>
    </div>
  )
}

// Section component
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-space-400 font-medium uppercase tracking-wide text-[10px]">
        {title}
      </div>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  )
}

// Stat row component
function Stat({ 
  label, 
  value, 
  mini = false,
  highlight = false,
  isError = false
}: { 
  label: string
  value: string | number
  mini?: boolean
  highlight?: boolean
  isError?: boolean
}) {
  return (
    <div className={`flex justify-between items-center ${mini ? 'text-[10px]' : ''}`}>
      <span className="text-space-400">{label}</span>
      <span className={`font-mono ${
        isError ? 'text-red-400' : 
        highlight ? 'text-green-400' : 
        'text-space-200'
      }`}>
        {value}
      </span>
    </div>
  )
}
