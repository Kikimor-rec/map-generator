export type JsonScalar = string | number | boolean | null
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue }

export function stableJson(value: unknown): string {
  return JSON.stringify(normalize(value, new WeakSet<object>()))
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

function normalize(value: unknown, ancestors: WeakSet<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('stableJson does not support non-finite numbers')
    }
    return value
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
      return value.map((item) => normalize(item, ancestors))
    }

    const record = value as Record<string, unknown>
    return Object.keys(record)
      .sort()
      .reduce<{ [key: string]: JsonValue }>((result, key) => {
        result[key] = normalize(record[key], ancestors)
        return result
      }, {})
  } finally {
    ancestors.delete(value)
  }
}
