import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { findForbiddenProductionImports } from './lib/production-generation-boundary.mjs'

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const entryPoints = [
  'src/ui/panels/GenerationPanel.tsx',
  'src/workers/generation.worker.ts',
]
const forbiddenFragments = [
  'src/generators/quality/pipeline',
  'src/generators/mapGenerator',
  'src/generators/compatibility/legacyPipeline',
  'src/generators/layout',
  'src/generators/topology',
  'src/generators/skeletonGenerator',
  'src/generators/skeletonGeneratorV2',
]

const violations = await findForbiddenProductionImports({
  rootDir,
  entryPoints,
  forbiddenFragments,
})

if (violations.length > 0) {
  for (const violation of violations) {
    process.stderr.write(`${violation.importChain.join(' -> ')}\n`)
  }
  process.exitCode = 1
} else {
  process.stdout.write(`checked ${entryPoints.length} production entry points\n`)
  process.stdout.write('production generator boundary: ok\n')
}
