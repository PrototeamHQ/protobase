import { limits } from '../limits'
import type { CacheEntry, TaskCache } from '../run/cache/cache-port'
import { cacheKey, type KeyShape } from '../run/cache/cache-key'
import { trackReads } from '../run/cache/read-tracker'
import { jsonBytes } from '../run/json-bytes'
import type { TaskContext } from '../run/port'
import type { CachePlan } from './cache-plan'
import type { EarlierResult } from './cache-types'
import type { PluginMail, PluginServices } from './context'

/** A result a step took from `earlier`: the cache keeps its entry as it is. */
class Reused {
  constructor(readonly output: unknown) {}
}

export const reuse = (output: unknown) => new Reused(output)

/** What the cached call hands the step's code in place of its own: its input, services and mailbox, and `earlier`. */
export type CallParts = { input: Record<string, unknown>; services: PluginServices; mailbox: PluginMail | undefined; earlier?: EarlierResult }

// The cache is a shortcut, never a reason to fail: a store that fails or is slow leaves the step to run without it.
// The worker's own stop still ends the step.
const late = Symbol('late')
const tolerant = async <T>(task: TaskContext, what: string, call: () => Promise<T>): Promise<T | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof late>((resolve) => (timer = setTimeout(resolve, limits.cacheLookupMs, late)))
  try {
    const result = await Promise.race([call(), timeout])
    if (result !== late) return result
    task.log(`The cache took too long to ${what}; the step ran without it`)
    return
  } catch (error) {
    if (task.signal.aborted) throw error
    task.log(`The cache could not ${what}; the step ran without it`)
    return
  } finally {
    clearTimeout(timer)
  }
}

// The services as a cached call sees them: one that acts as someone the key does not hold, or any use of the run's own
// files, which no key can hold, marks the call as not to keep. Forcing the cache on does not lift this.
const watched = (services: PluginServices, mailbox: PluginMail | undefined, actsAs: readonly string[], used: Set<string>) => {
  const mark = <T extends object>(name: string, target: T): T => {
    if (actsAs.includes(name)) return target
    return new Proxy(target, { get: (object, key, receiver) => (used.add(name), Reflect.get(object, key, receiver)) })
  }
  // What a step hands a request is part of what it read, whether or not anything reads it before it leaves.
  const fetch: PluginServices['fetch'] = (url, init) => (JSON.stringify([url, init ?? null]), services.fetch(url, init))
  return { services: { ...services, fetch, records: mark('records', services.records), files: mark('files', services.files) }, mailbox: mailbox && mark('mailbox', mailbox) }
}

const shapesOf = async (plan: CachePlan, type: string, task: TaskContext): Promise<KeyShape[]> => {
  if (plan.key === 'input') return [{ input: true }]
  if (typeof plan.key === 'function') return [{ custom: true }]
  return (await tolerant(task, 'be read', () => plan.cache.store.shapes(type))) ?? []
}

// The key value of a custom key function: undefined, so the call is not cached, when it throws or gives nothing.
const customValue = (plan: CachePlan, input: Record<string, unknown>, task: TaskContext) => {
  if (typeof plan.key !== 'function') return input
  try {
    const value = plan.key(input)
    return value ?? undefined
  } catch {
    task.log("The step type's cache key failed; the step ran without the cache")
    return
  }
}

const earlierOf = (entry: CacheEntry): EarlierResult => ({ output: entry.output, cached_at: entry.cachedAt.toISOString(), expires_at: entry.expiresAt.toISOString(), secrets_changed: entry.secretsChanged })

const logHit = (task: TaskContext, entry: CacheEntry) => {
  task.log(`An earlier result from ${entry.cachedAt.toISOString()} was in the cache`)
  for (const name of entry.secretsChanged) task.log(`The secret ${name} changed since that result was kept`)
}

/**
 * One call of a step type with its cache on: the result of an earlier call with the same key and identity when the
 * type returns hits, else the step's own run, offered the earlier result when it asks for one, whose fresh result is
 * kept. A failure, a reused result, a result over `limits.cacheValueBytes` and a call that acted as someone its key
 * does not hold are not kept.
 */
export const cachedRun = async (plan: CachePlan, type: string, parts: CallParts, task: TaskContext, run: (parts: CallParts) => Promise<unknown>) => {
  const { cache } = plan
  const keyValue = customValue(plan, parts.input, task)
  if (keyValue === undefined) return run(parts)
  const call = { runId: task.runId, type, identity: plan.identity }
  const keys = (await Promise.all((await shapesOf(plan, type, task)).map((shape) => cacheKey(type, shape, keyValue, cache.nameSecrets)))).flatMap((key) => (key ? [key.key] : []))
  const entry = keys.length === 0 ? undefined : await tolerant(task, 'be read', () => cache.store.lookup({ ...call, keys }))
  if (entry) logHit(task, entry)
  if (entry && plan.use === 'return') return entry.output
  const used = new Set<string>()
  const tracked = plan.key === 'reads' ? trackReads(structuredClone(parts.input)) : undefined
  const returned = await run({ ...watched(parts.services, parts.mailbox, plan.actsAs, used), input: tracked?.input ?? parts.input, ...(entry && plan.use === 'offer' && { earlier: earlierOf(entry) }) })
  if (returned instanceof Reused) return returned.output
  // The result as JSON, as its step record keeps it, taken before the reads: an input value it hands back is one it read.
  const result = returned === undefined ? undefined : JSON.parse(JSON.stringify(returned))
  await keep(cache, task, { ...call, plan, keyValue, used, shape: tracked ? { reads: tracked.paths() } : plan.key === 'input' ? { input: true } : { custom: true }, result })
  return result
}

type Kept = { runId: string; type: string; identity: CachePlan['identity']; plan: CachePlan; keyValue: unknown; used: Set<string>; shape: KeyShape; result: unknown }

const keep = async (cache: TaskCache, task: TaskContext, { plan, keyValue, used, shape, result, ...call }: Kept) => {
  if (used.size > 0) return task.log(`The result was not cached: the step used ${[...used].sort().join(', ')}`)
  const output = cache.redact(result)
  if (jsonBytes(output) > limits.cacheValueBytes) return task.log(`The result was not cached: it is larger than ${limits.cacheValueBytes / 1024} KiB`)
  const key = await cacheKey(call.type, shape, keyValue, cache.nameSecrets)
  if (!key) return
  await tolerant(task, 'be written', () => cache.store.write({ ...call, key: key.key, shape, output, seconds: plan.seconds, secrets: key.secrets }))
}
