import { describe, expect, it } from 'vitest'
import { stableHash, stableJson } from '../stableJson'

describe('stableJson', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(stableJson({ z: 1, a: { y: 2, x: [3, 1] } }))
      .toBe('{"a":{"x":[3,1],"y":2},"z":1}')
  })

  it('preserves an own enumerable __proto__ key', () => {
    const value = Object.create(null) as Record<string, unknown>
    value.safe = true
    Object.defineProperty(value, '__proto__', {
      enumerable: true,
      value: { nested: 'kept' },
    })

    expect(stableJson(value))
      .toBe('{"__proto__":{"nested":"kept"},"safe":true}')
  })

  it('sorts integer-like keys in code-point order', () => {
    expect(stableJson({ 2: 'two', 10: 'ten', 1: 'one' }))
      .toBe('{"1":"one","10":"ten","2":"two"}')
  })

  it('supports null-prototype objects', () => {
    const value = Object.assign(Object.create(null) as Record<string, unknown>, {
      z: 1,
      a: 2,
    })

    expect(stableJson(value)).toBe('{"a":2,"z":1}')
  })

  it('emits sparse array slots as null while rejecting explicit undefined', () => {
    const sparse = new Array<unknown>(2)
    sparse[1] = 'kept'

    expect(stableJson(sparse)).toBe('[null,"kept"]')
    expect(() => stableJson([undefined])).toThrow('undefined')
  })

  it.each([
    { value: Number.NaN, label: 'non-finite number' },
    { value: undefined, label: 'undefined' },
    { value: 1n, label: 'bigint' },
    { value: { rejected: () => undefined }, label: 'function value' },
    { value: { rejected: Symbol('value') }, label: 'symbol value' },
  ])('rejects $label', ({ value }) => {
    expect(() => stableJson(value)).toThrow()
  })

  it('rejects symbol keys', () => {
    const value = { [Symbol('key')]: 'rejected' }

    expect(() => stableJson(value)).toThrow('symbol keys')
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

  it('hashes UTF-16 code units', () => {
    expect(stableHash('🚀')).toBe('ae08428e')
  })
})
