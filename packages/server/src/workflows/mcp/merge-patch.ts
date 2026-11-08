const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * `patch` applied to `target` as a JSON Merge Patch (RFC 7396): an object merges into the object at its place, a member
 * set to null is removed, and any other value, a list included, replaces what was there. Neither input is changed.
 */
export const mergePatch = (target: unknown, patch: unknown): unknown => {
  if (!isObject(patch)) return patch
  const merged: Record<string, unknown> = isObject(target) ? { ...target } : {}
  for (const [name, value] of Object.entries(patch)) {
    if (value === null) delete merged[name]
    else merged[name] = mergePatch(merged[name], value)
  }
  return merged
}
