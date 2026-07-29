import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import ts from 'typescript'

const MODULE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]

export async function findForbiddenProductionImports({
  rootDir,
  entryPoints,
  forbiddenFragments,
}) {
  const absoluteRoot = path.resolve(rootDir)
  const aliases = readPathAliases(absoluteRoot)
  const adjacency = new Map()
  const violations = []

  for (const entryPoint of [...entryPoints].sort()) {
    const entryFile = await resolveEntryPoint(absoluteRoot, entryPoint)
    const queue = [{ file: entryFile, chain: [entryFile] }]
    const visited = new Set([entryFile])

    while (queue.length > 0) {
      const current = queue.shift()
      const forbiddenFragment = forbiddenFragments.find((fragment) =>
        matchesForbiddenModule(
          toRepositoryPath(absoluteRoot, current.file),
          fragment,
        ),
      )

      if (forbiddenFragment !== undefined) {
        violations.push({
          entryPoint: toRepositoryPath(absoluteRoot, entryFile),
          forbiddenModule: toRepositoryPath(absoluteRoot, current.file),
          importChain: current.chain.map((file) =>
            toRepositoryPath(absoluteRoot, file),
          ),
        })
        continue
      }

      const importedFiles = await getImportedFiles({
        absoluteRoot,
        aliases,
        adjacency,
        file: current.file,
      })

      for (const importedFile of importedFiles) {
        if (visited.has(importedFile)) continue
        visited.add(importedFile)
        queue.push({
          file: importedFile,
          chain: [...current.chain, importedFile],
        })
      }
    }
  }

  return violations.sort(compareViolations)
}

async function getImportedFiles({
  absoluteRoot,
  aliases,
  adjacency,
  file,
}) {
  const cached = adjacency.get(file)
  if (cached !== undefined) return cached

  const source = await readFile(file, 'utf8')
  const preprocessed = ts.preProcessFile(source, true, true)
  const importedFiles = []

  for (const imported of preprocessed.importedFiles) {
    const resolved = await resolveLocalModule({
      absoluteRoot,
      aliases,
      importer: file,
      specifier: imported.fileName,
    })
    if (resolved !== undefined) importedFiles.push(resolved)
  }

  const stableImports = [...new Set(importedFiles)].sort((left, right) =>
    toRepositoryPath(absoluteRoot, left).localeCompare(
      toRepositoryPath(absoluteRoot, right),
    ),
  )
  adjacency.set(file, stableImports)
  return stableImports
}

async function resolveEntryPoint(absoluteRoot, entryPoint) {
  const entryFile = path.resolve(absoluteRoot, entryPoint)
  if (!isWithinRoot(absoluteRoot, entryFile) || !(await isFile(entryFile))) {
    throw new Error(`Production entry point does not exist: ${entryPoint}`)
  }
  return entryFile
}

async function resolveLocalModule({
  absoluteRoot,
  aliases,
  importer,
  specifier,
}) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0]
  const candidateBases = []

  if (cleanSpecifier.startsWith('.')) {
    candidateBases.push(path.resolve(path.dirname(importer), cleanSpecifier))
  } else {
    for (const alias of aliases) {
      const match = matchAlias(alias.pattern, cleanSpecifier)
      if (match === undefined) continue
      for (const target of alias.targets) {
        candidateBases.push(
          path.resolve(alias.baseUrl, target.replaceAll('*', match)),
        )
      }
    }
  }

  for (const candidateBase of candidateBases) {
    if (!isWithinRoot(absoluteRoot, candidateBase)) continue
    const resolved = await resolveModuleFile(candidateBase)
    if (resolved !== undefined && isWithinRoot(absoluteRoot, resolved)) {
      return resolved
    }
  }

  return undefined
}

async function resolveModuleFile(candidateBase) {
  const extension = path.extname(candidateBase)
  const candidates = []

  if (MODULE_EXTENSIONS.includes(extension)) {
    candidates.push(candidateBase)
  } else if (extension === '') {
    for (const supportedExtension of MODULE_EXTENSIONS) {
      candidates.push(`${candidateBase}${supportedExtension}`)
    }
    for (const supportedExtension of MODULE_EXTENSIONS) {
      candidates.push(path.join(candidateBase, `index${supportedExtension}`))
    }
  }

  for (const candidate of candidates) {
    if (await isFile(candidate)) return path.resolve(candidate)
  }
  return undefined
}

function readPathAliases(absoluteRoot) {
  const defaultAliases = [
    {
      pattern: '@/*',
      targets: ['src/*'],
      baseUrl: absoluteRoot,
    },
  ]
  const configPath = ts.findConfigFile(
    absoluteRoot,
    ts.sys.fileExists,
    'tsconfig.json',
  )
  if (configPath === undefined) return defaultAliases

  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error !== undefined) return defaultAliases

  const compilerOptions = config.config.compilerOptions ?? {}
  const baseUrl = path.resolve(
    path.dirname(configPath),
    compilerOptions.baseUrl ?? '.',
  )
  const configuredAliases = Object.entries(compilerOptions.paths ?? {}).map(
    ([pattern, targets]) => ({
      pattern,
      targets,
      baseUrl,
    }),
  )

  const hasRootAlias = configuredAliases.some(
    (alias) => alias.pattern === '@/*',
  )
  return hasRootAlias
    ? configuredAliases
    : [...configuredAliases, ...defaultAliases]
}

function matchAlias(pattern, specifier) {
  const wildcardIndex = pattern.indexOf('*')
  if (wildcardIndex === -1) return pattern === specifier ? '' : undefined

  const prefix = pattern.slice(0, wildcardIndex)
  const suffix = pattern.slice(wildcardIndex + 1)
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
    return undefined
  }
  return specifier.slice(prefix.length, specifier.length - suffix.length)
}

function matchesForbiddenModule(repositoryPath, forbiddenFragment) {
  const modulePath = removeModuleExtension(normalizePath(repositoryPath))
  const fragment = removeModuleExtension(normalizePath(forbiddenFragment))
  return modulePath === fragment || modulePath.startsWith(`${fragment}/`)
}

function removeModuleExtension(filePath) {
  const extension = MODULE_EXTENSIONS.find((candidate) =>
    filePath.endsWith(candidate),
  )
  return extension === undefined
    ? filePath.replace(/\/$/, '')
    : filePath.slice(0, -extension.length)
}

function toRepositoryPath(absoluteRoot, file) {
  return normalizePath(path.relative(absoluteRoot, file))
}

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '')
}

function isWithinRoot(absoluteRoot, candidate) {
  const relative = path.relative(absoluteRoot, candidate)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..')
  )
}

async function isFile(file) {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

function compareViolations(left, right) {
  return (
    left.entryPoint.localeCompare(right.entryPoint) ||
    left.forbiddenModule.localeCompare(right.forbiddenModule) ||
    left.importChain.join('\0').localeCompare(right.importChain.join('\0'))
  )
}
