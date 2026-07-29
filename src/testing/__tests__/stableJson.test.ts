import { describe, expect, it } from 'vitest'
import { stableHash, stableJson } from '../stableJson'

describe('stableJson', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(stableJson({ z: 1, a: { y: 2, x: [3, 1] } }))
      .toBe('{"a":{"x":[3,1],"y":2},"z":1}')
  })

  it.each([
    { value: Number.NaN, label: 'non-finite number' },
    { value: undefined, label: 'undefined' },
    { value: 1n, label: 'bigint' },
  ])('rejects $label', ({ value }) => {
    expect(() => stableJson(value)).toThrow()
  })

  it('rejects cyclic input', () => {
    const value: Record<string, unknown> = {}
    value.self = value
    expect(() => stableJson(value)).toThrow('cyclic')
  })
})

describe('stableHash', () => {
  it('ignores object insertion order but not array order', () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }))
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]))
  })
})
