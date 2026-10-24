type Plugin = { id: string; endpoints?: object }

/**
 * Each endpoint key more than one plugin registers, with those plugins' ids. Better Auth merges the plugins' endpoints
 * by key into one object, so a later plugin's endpoint silently replaces an earlier one's of the same key, and the
 * earlier one's path answers 404.
 */
export const endpointKeyClashes = (plugins: Plugin[]) => {
  const owners = new Map<string, string[]>()
  for (const plugin of plugins) {
    for (const key of Object.keys(plugin.endpoints ?? {})) owners.set(key, [...(owners.get(key) ?? []), plugin.id])
  }
  return [...owners].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({ key, plugins: ids }))
}

/** Fails when two plugins register an endpoint of the same key, as one would hide the other. */
export const assertNoEndpointKeyClashes = (plugins: Plugin[]) => {
  const clashes = endpointKeyClashes(plugins)
  if (clashes.length === 0) return
  const list = clashes.map(({ key, plugins: ids }) => `${key} (${ids.join(', ')})`).join('; ')
  throw new Error(`Auth plugins register the same endpoint keys, so one hides the other: ${list}`)
}
