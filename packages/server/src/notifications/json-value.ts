export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

// Keys that, merged or assigned onto an object, would reach its prototype.
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype'])
const maxDepth = 16

const isPlainObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * The path of the first part of `value` that is not plain JSON, or `undefined` when all of it is: plain objects,
 * arrays, strings, finite numbers, booleans and null, at most 16 levels deep, without a `__proto__`, `constructor` or
 * `prototype` key at any depth.
 */
export const jsonProblem = (value: unknown, path: string, depth = 0): string | undefined => {
  if (depth > maxDepth) return path
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : path
  if (typeof value !== 'object') return path
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const problem = jsonProblem(item, `${path}.${index}`, depth + 1)
      if (problem !== undefined) return problem
    }
    return undefined
  }
  if (!isPlainObject(value)) return path
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || forbiddenKeys.has(key)) return `${path}.${String(key)}`
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (!('value' in descriptor)) return `${path}.${key}`
    const problem = jsonProblem(descriptor.value, `${path}.${key}`, depth + 1)
    if (problem !== undefined) return problem
  }
  return undefined
}

/** Whether `value` is a plain JSON object, as `jsonProblem` checks it. */
export const isJsonObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value) && isPlainObject(value)

/**
 * `over` merged into `base`, objects key by key and anything else replaced, as new objects: neither is changed and no
 * key is assigned onto an object with a prototype. Both are plain JSON, as `jsonProblem` checks.
 */
export const mergeJson = (base: JsonObject, over: JsonObject): JsonObject => {
  const merged: JsonObject = Object.create(null)
  for (const [key, value] of Object.entries(base)) merged[key] = value
  for (const [key, value] of Object.entries(over)) {
    const under = merged[key]
    merged[key] = isJsonObject(under) && isJsonObject(value) ? mergeJson(under, value) : value
  }
  return structuredClone({ ...merged })
}
