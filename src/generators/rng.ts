/**
 * Seeded Random Number Generator
 * Uses mulberry32 algorithm for deterministic results across platforms
 */

import type { SeededRNG } from './types'

/**
 * Create a seeded RNG from a seed string or number
 */
export function createRNG(seed: string | number): SeededRNG {
  // Convert seed to number if string
  let numSeed: number
  if (typeof seed === 'string') {
    numSeed = hashString(seed)
  } else {
    numSeed = seed
  }
  
  // Mulberry32 state
  let state = numSeed >>> 0
  
  // Mulberry32 algorithm
  function mulberry32(): number {
    state |= 0
    state = state + 0x6D2B79F5 | 0
    let t = Math.imul(state ^ state >>> 15, 1 | state)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
  
  return {
    random(): number {
      return mulberry32()
    },
    
    randomInt(min: number, max: number): number {
      return Math.floor(mulberry32() * (max - min + 1)) + min
    },
    
    randomFloat(min: number, max: number): number {
      return mulberry32() * (max - min) + min
    },
    
    pick<T>(array: T[]): T {
      if (array.length === 0) {
        throw new Error('Cannot pick from empty array')
      }
      const index = Math.floor(mulberry32() * array.length)
      return array[index]
    },
    
    shuffle<T>(array: T[]): T[] {
      const result = [...array]
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(mulberry32() * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
      }
      return result
    },
    
    chance(probability: number): boolean {
      return mulberry32() < probability
    }
  }
}

/**
 * Hash a string to a 32-bit integer
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash >>> 0 // Ensure unsigned
}

/**
 * Generate a stable ID based on seed and local index
 */
export function generateStableId(prefix: string, seed: string | number, index: number): string {
  const combined = `${seed}-${prefix}-${index}`
  const hash = hashString(combined).toString(16).slice(0, 8)
  return `${prefix}-${hash}`
}
