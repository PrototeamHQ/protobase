import { canonicalJson } from './canonical'
import type { CacheIdentity, StepCacheStore } from './cache-port'

type Entry = { output: unknown; cachedAt: Date; expiresAt: Date; secrets: Record<string, string | undefined> }

/**
 * A step cache kept in memory, for the package's unit tests: `whoOf` says who a run's call acts as (its tenant, saver,
 * enabler and bound account), `secrets` gives the secrets' current values, and `now` the clock. It keeps the values of
 * the secrets a key named only to tell when one changed. `calls` counts every call, by name.
 */
export const memoryCache = ({ whoOf = () => ({}), secrets = () => ({}), now = () => new Date() }: { whoOf?: (runId: string, identity: CacheIdentity) => unknown; secrets?: () => Record<string, string>; now?: () => Date } = {}) => {
  const entries = new Map<string, Entry>()
  const shapes = new Map<string, Set<string>>()
  const calls = { shapes: 0, lookup: 0, write: 0 }
  const where = (runId: string, type: string, identity: CacheIdentity, key: string) => canonicalJson([type, whoOf(runId, identity) ?? null, key])
  const store: StepCacheStore = {
    shapes: async (type) => {
      calls.shapes++
      return [...(shapes.get(type) ?? [])].map((shape) => JSON.parse(shape))
    },
    lookup: async ({ runId, type, identity, keys }) => {
      calls.lookup++
      const found = keys.flatMap((key) => entries.get(where(runId, type, identity, key)) ?? []).filter((entry) => entry.expiresAt > now())
      const entry = found.sort((a, b) => b.cachedAt.getTime() - a.cachedAt.getTime())[0]
      if (!entry) return
      const current = secrets()
      return { output: structuredClone(entry.output), cachedAt: entry.cachedAt, expiresAt: entry.expiresAt, secretsChanged: Object.keys(entry.secrets).filter((name) => entry.secrets[name] !== current[name]) }
    },
    write: async ({ runId, type, identity, key, shape, output, seconds, secrets: names }) => {
      calls.write++
      shapes.set(type, (shapes.get(type) ?? new Set()).add(canonicalJson(shape)))
      const current = secrets()
      entries.set(where(runId, type, identity, key), { output: structuredClone(output), cachedAt: now(), expiresAt: new Date(now().getTime() + seconds * 1000), secrets: Object.fromEntries(names.map((name) => [name, current[name]])) })
    },
  }
  return { store, calls, entries }
}
