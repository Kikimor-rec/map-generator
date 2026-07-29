export type JsonScalar = string | number | boolean | null
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue }

export function stableJson(value: unknown): string {
  return emitJson(value, new WeakSet<object>())
}

export function stableHash(value: unknown): string {
  const json = stableJson(value)
  let hash = 0x811c9dc5

  for (let index = 0; index < json.length; index++) {
    hash ^= json.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function emitJson(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('stableJson does not support non-finite numbers')
    }

    const encoded = JSON.stringify(value)
    if (encoded === undefined) {
      throw new TypeError(`stableJson does not support ${typeof value}`)
    }
    return encoded
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new TypeError(`stableJson does not support ${typeof value}`)
  }

  if (ancestors.has(value)) {
    throw new TypeError('stableJson does not support cyclic values')
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError('stableJson does not support symbol keys')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const items = Array.from(
        { length: value.length },
        (_, index) => index in value ? emitJson(value[index], ancestors) : 'null',
      )
      return `[${items.join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('stableJson supports only arrays and plain objects')
    }

    const record = value as Record<string, unknown>
    const properties = Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${emitJson(record[key], ancestors)}`)

    return `{${properties.join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}
