import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { findForbiddenProductionImports } from '../lib/production-generation-boundary.mjs'

async function withFixture(files, run) {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), 'production-generation-boundary-'),
  )

  try {
    await Promise.all(
      Object.entries(files).map(async ([relativePath, source]) => {
        const filePath = path.join(rootDir, relativePath)
        await mkdir(path.dirname(filePath), { recursive: true })
        await writeFile(filePath, source, 'utf8')
      }),
    )
    await run(rootDir)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

test('reports a transitive forbidden re-export with the full chain', async () => {
  await withFixture(
    {
      'src/entry.ts': "import { generate } from './facade'\nvoid generate\n",
      'src/facade.ts':
        "export { generate } from '@/generators/compatibility/legacyPipeline'\n",
      'src/generators/compatibility/legacyPipeline.ts':
        'export const generate = () => null\n',
    },
    async (rootDir) => {
      const violations = await findForbiddenProductionImports({
        rootDir,
        entryPoints: ['src/entry.ts'],
        forbiddenFragments: [
          'src/generators/compatibility/legacyPipeline',
        ],
      })

      assert.deepEqual(violations, [
        {
          entryPoint: 'src/entry.ts',
          forbiddenModule:
            'src/generators/compatibility/legacyPipeline.ts',
          importChain: [
            'src/entry.ts',
            'src/facade.ts',
            'src/generators/compatibility/legacyPipeline.ts',
          ],
        },
      ])
    },
  )
})

test('allows TSX production modules to reach occupancy and shared roomProgram', async () => {
  await withFixture(
    {
      'src/entry.tsx':
        "import { generate } from './facade.ts'\nvoid generate\n",
      'src/facade.ts':
        "export * from '@/generators/gridGenerator'\nexport { roomProgram } from '@/generators/roomProgram'\n",
      'src/generators/gridGenerator/index.ts':
        "export { generate } from './occupancyGenerator'\n",
      'src/generators/gridGenerator/occupancyGenerator.tsx':
        'export const generate = () => null\n',
      'src/generators/roomProgram.ts':
        'export const roomProgram = { rooms: [] }\n',
      'src/generators/compatibility/legacyPipeline.ts':
        'export const legacy = () => null\n',
    },
    async (rootDir) => {
      const violations = await findForbiddenProductionImports({
        rootDir,
        entryPoints: ['src/entry.tsx'],
        forbiddenFragments: [
          'src/generators/compatibility/legacyPipeline',
          'src/generators/layout',
        ],
      })

      assert.deepEqual(violations, [])
    },
  )
})

test('returns stable violations with the shortest discovered import chain', async () => {
  await withFixture(
    {
      'src/entry.ts':
        "import './longRoute'\nimport './shortRoute'\nimport './otherRoute'\n",
      'src/longRoute.ts': "export * from './middle'\n",
      'src/middle.ts':
        "export * from '@/generators/compatibility/legacyPipeline'\n",
      'src/shortRoute.ts':
        "export * from '@/generators/compatibility/legacyPipeline'\n",
      'src/otherRoute.ts': "export * from '@/generators/mapGenerator'\n",
      'src/generators/compatibility/legacyPipeline.ts':
        'export const legacy = () => null\n',
      'src/generators/mapGenerator.ts':
        'export const mapGenerator = () => null\n',
    },
    async (rootDir) => {
      const violations = await findForbiddenProductionImports({
        rootDir,
        entryPoints: ['src/entry.ts'],
        forbiddenFragments: [
          'src/generators/mapGenerator',
          'src/generators/compatibility/legacyPipeline',
        ],
      })

      assert.deepEqual(violations, [
        {
          entryPoint: 'src/entry.ts',
          forbiddenModule:
            'src/generators/compatibility/legacyPipeline.ts',
          importChain: [
            'src/entry.ts',
            'src/shortRoute.ts',
            'src/generators/compatibility/legacyPipeline.ts',
          ],
        },
        {
          entryPoint: 'src/entry.ts',
          forbiddenModule: 'src/generators/mapGenerator.ts',
          importChain: [
            'src/entry.ts',
            'src/otherRoute.ts',
            'src/generators/mapGenerator.ts',
          ],
        },
      ])
    },
  )
})
