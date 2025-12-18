/**
 * Comprehensive test script for map generation
 */

import { generateMap, type GeneratorOptions } from './src/generators/generator'
import { runQualityPipeline } from './src/generators/quality/pipeline'
import type { QualityPipelineOptions } from './src/generators/quality/types'

// ============================================================================
// TEST 1: Standard Generator - Size Tiers
// ============================================================================
async function testStandardSizes() {
  console.log('\n========== TEST 1: STANDARD GENERATOR SIZES ==========\n')
  
  const sizes = ['xs', 'sm', 'md', 'lg'] as const
  
  for (const sizeTier of sizes) {
    const options: GeneratorOptions = {
      seed: `size-test-${sizeTier}`,
      archetype: 'ship',
      subtype: 'explorer',
      sizeTier,
      loopiness: 0.5,
      danger: 0.3
    }
    
    const result = generateMap(options)
    
    if (result.success && result.map) {
      const totalRooms = result.map.decks.reduce((sum, d) => sum + d.rooms.length, 0)
      const totalConnectors = result.map.decks.reduce((sum, d) => sum + d.connectors.length, 0)
      console.log(`${sizeTier.toUpperCase()}: ${totalRooms} rooms, ${totalConnectors} connectors, ${result.map.decks.length} decks`)
    } else {
      console.log(`${sizeTier.toUpperCase()}: FAILED`)
    }
  }
}

// ============================================================================
// TEST 2: Corridor Coalesce
// ============================================================================
async function testCorridorCoalesce() {
  console.log('\n========== TEST 2: CORRIDOR COALESCE ==========\n')
  
  // Generate a map with high loopiness to create overlapping corridors
  const options: GeneratorOptions = {
    seed: 'coalesce-test-1',
    archetype: 'station',
    subtype: 'trading',
    sizeTier: 'md',
    loopiness: 0.9, // High loopiness for more corridor overlaps
    danger: 0.3
  }
  
  const result = generateMap(options)
  
  if (result.success && result.map) {
    const deck = result.map.decks[0]
    console.log(`Rooms: ${deck.rooms.length}`)
    console.log(`Connectors: ${deck.connectors.length}`)
    
    // Check for duplicate waypoints (sign of non-coalesced corridors)
    const waypointCounts = new Map<string, number>()
    for (const conn of deck.connectors) {
      const path = (conn as any).path || (conn as any).waypoints || []
      for (const wp of path) {
        const key = `${wp.x},${wp.y}`
        waypointCounts.set(key, (waypointCounts.get(key) || 0) + 1)
      }
    }
    
    const sharedPoints = [...waypointCounts.entries()].filter(([_, count]) => count > 1)
    console.log(`Shared waypoints: ${sharedPoints.length}`)
    
    if (sharedPoints.length > 0) {
      console.log(`  (Some overlap detected - coalesce may need improvement)`)
    } else {
      console.log(`  ✓ No overlapping waypoints`)
    }
  }
}

// ============================================================================
// TEST 3: Quality Pipeline - All Modes
// ============================================================================
async function testQualityModes() {
  console.log('\n========== TEST 3: QUALITY PIPELINE MODES ==========\n')
  
  const modes = ['draft', 'standard', 'polish'] as const
  
  for (const mode of modes) {
    const options: QualityPipelineOptions = {
      seed: `quality-${mode}-test`,
      qualityMode: mode,
      mapParams: {
        archetype: 'ship',
        subtype: 'explorer',
        sizeTier: 'sm'
      }
    }
    
    const startTime = performance.now()
    const result = await runQualityPipeline(options)
    const elapsed = performance.now() - startTime
    
    const status = result.bestCandidate?.isValid ? '✓' : '⚠'
    const rooms = result.bestCandidate?.data.placedRooms.length ?? 0
    const corridors = result.bestCandidate?.data.corridors.length ?? 0
    const score = result.bestCandidate?.score?.toFixed(1) ?? 'N/A'
    
    console.log(`${mode.toUpperCase()}: ${status} ${result.validCandidates}/${result.candidatesEvaluated} valid, ${rooms} rooms, ${corridors} corridors, score=${score}, ${elapsed.toFixed(0)}ms`)
  }
}

// ============================================================================
// TEST 4: Archetypes
// ============================================================================
async function testArchetypes() {
  console.log('\n========== TEST 4: ARCHETYPES ==========\n')
  
  const archetypes: Array<{ archetype: 'ship' | 'station' | 'outpost', subtype: string }> = [
    { archetype: 'ship', subtype: 'explorer' },
    { archetype: 'ship', subtype: 'military' },
    { archetype: 'station', subtype: 'trading' },
    { archetype: 'station', subtype: 'research' },
    { archetype: 'outpost', subtype: 'mining' },
  ]
  
  for (const { archetype, subtype } of archetypes) {
    const options: GeneratorOptions = {
      seed: `archetype-${archetype}-${subtype}`,
      archetype,
      subtype: subtype as any,
      sizeTier: 'sm',
      loopiness: 0.5,
      danger: 0.3
    }
    
    const result = generateMap(options)
    
    if (result.success && result.map) {
      const totalRooms = result.map.decks.reduce((sum, d) => sum + d.rooms.length, 0)
      console.log(`${archetype}/${subtype}: ✓ ${totalRooms} rooms`)
    } else {
      console.log(`${archetype}/${subtype}: ✗ FAILED - ${result.issues[0]?.message || 'unknown'}`)
    }
  }
}

// ============================================================================
// TEST 5: Seed Reproducibility
// ============================================================================
async function testReproducibility() {
  console.log('\n========== TEST 5: SEED REPRODUCIBILITY ==========\n')
  
  const seed = 'reproducibility-test-123'
  
  // Generate twice with same seed
  const result1 = generateMap({ seed, archetype: 'ship', subtype: 'explorer', sizeTier: 'sm' })
  const result2 = generateMap({ seed, archetype: 'ship', subtype: 'explorer', sizeTier: 'sm' })
  
  if (result1.success && result2.success && result1.map && result2.map) {
    const rooms1 = result1.map.decks[0].rooms.length
    const rooms2 = result2.map.decks[0].rooms.length
    const connectors1 = result1.map.decks[0].connectors.length
    const connectors2 = result2.map.decks[0].connectors.length
    
    const match = rooms1 === rooms2 && connectors1 === connectors2
    
    if (match) {
      console.log(`✓ Reproducible: Same seed produces same results (${rooms1} rooms, ${connectors1} connectors)`)
    } else {
      console.log(`✗ NOT Reproducible: Run 1: ${rooms1} rooms, ${connectors1} conn | Run 2: ${rooms2} rooms, ${connectors2} conn`)
    }
  } else {
    console.log(`✗ Generation failed`)
  }
}

// ============================================================================
// TEST 6: Edge Cases
// ============================================================================
async function testEdgeCases() {
  console.log('\n========== TEST 6: EDGE CASES ==========\n')
  
  // Minimum loopiness
  const lowLoop = generateMap({ seed: 'edge-1', sizeTier: 'xs', loopiness: 0 })
  console.log(`loopiness=0: ${lowLoop.success ? '✓' : '✗'} ${lowLoop.map?.decks[0]?.connectors.length ?? 0} connectors`)
  
  // Maximum loopiness
  const highLoop = generateMap({ seed: 'edge-2', sizeTier: 'xs', loopiness: 1 })
  console.log(`loopiness=1: ${highLoop.success ? '✓' : '✗'} ${highLoop.map?.decks[0]?.connectors.length ?? 0} connectors`)
  
  // High danger
  const highDanger = generateMap({ seed: 'edge-3', sizeTier: 'sm', danger: 1 })
  console.log(`danger=1: ${highDanger.success ? '✓' : '✗'}`)
  
  // XL size
  const xlSize = generateMap({ seed: 'edge-4', sizeTier: 'xl' })
  if (xlSize.success && xlSize.map) {
    const totalRooms = xlSize.map.decks.reduce((sum, d) => sum + d.rooms.length, 0)
    console.log(`sizeTier=xl: ✓ ${totalRooms} rooms, ${xlSize.map.decks.length} decks`)
  } else {
    console.log(`sizeTier=xl: ✗ FAILED`)
  }
}

// ============================================================================
// TEST 7: Validation
// ============================================================================
async function testValidation() {
  console.log('\n========== TEST 7: VALIDATION CHECKS ==========\n')
  
  const result = generateMap({ 
    seed: 'validation-test', 
    sizeTier: 'md',
    skipValidation: false 
  })
  
  if (result.success) {
    const warnings = result.issues.filter(i => i.severity === 'warning')
    const errors = result.issues.filter(i => i.severity === 'error')
    
    console.log(`Generation: ✓ Success`)
    console.log(`Warnings: ${warnings.length}`)
    console.log(`Errors: ${errors.length}`)
    
    if (warnings.length > 0) {
      console.log(`  First warning: ${warnings[0].message}`)
    }
  } else {
    console.log(`Generation: ✗ Failed`)
    console.log(`Issues: ${result.issues.map(i => i.message).join('; ')}`)
  }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║          MAP GENERATOR COMPREHENSIVE TEST SUITE            ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  
  const startTime = performance.now()
  
  await testStandardSizes()
  await testCorridorCoalesce()
  await testQualityModes()
  await testArchetypes()
  await testReproducibility()
  await testEdgeCases()
  await testValidation()
  
  const totalTime = performance.now() - startTime
  
  console.log('\n════════════════════════════════════════════════════════════')
  console.log(`All tests completed in ${(totalTime / 1000).toFixed(2)}s`)
  console.log('════════════════════════════════════════════════════════════\n')
}

runAllTests().catch(console.error)
