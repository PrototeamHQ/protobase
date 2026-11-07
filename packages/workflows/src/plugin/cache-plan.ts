import { limits } from '../limits'
import type { CacheIdentity, TaskCache } from '../run/cache/cache-port'
import { cacheSeconds } from '../run/cache/cache-ttl'
import type { StepCache } from './cache-types'
import type { StepType } from './types'

/** How one call of a step type uses the cache, once it is on for the call. */
export type CachePlan = {
  cache: TaskCache
  use: 'return' | 'offer'
  key: NonNullable<StepCache['key']>
  seconds: number
  identity: CacheIdentity
  /** The services the call may use and still be kept. */
  actsAs: readonly string[]
}

// Whether the cache is on for this call: off when the workflow says so; forced on when it says so, whatever the type
// says; otherwise as the type decides, a switch being off unless its default is on.
const isOn = (declared: StepCache | undefined, setting: boolean | undefined, input: Record<string, unknown>) => {
  if (setting === false) return false
  if (setting === true && declared?.choice !== 'switch') return true
  if (!declared) return false
  if (setting === undefined && declared.choice === 'switch' && declared.default !== true) return false
  return declared.when?.(input) ?? true
}

/**
 * The plan of one call of the type `id` with its checked input, or undefined when the cache is off for it, as it is for
 * every call of a type without `cache` that no workflow forces on. A type forced on without `cache` keys on its whole
 * input, returns a hit, keeps it `limits.cacheForcedSeconds`, and keys on every person a step acts as.
 */
export const cachePlan = (id: string, type: StepType, input: Record<string, unknown>, cache: TaskCache | undefined): CachePlan | { invalidTtl: true } | undefined => {
  if (!cache || !isOn(type.cache, cache.setting, input)) return
  const connection = type.connection === undefined ? {} : { connection: `${id.split(':')[0]}:${type.connection}` }
  const declared = type.cache
  if (!declared) return { cache, use: 'return', key: 'input', seconds: limits.cacheForcedSeconds, identity: { ...connection, saver: true, enabler: true }, actsAs: ['records', 'mailbox'] }
  const seconds = cacheSeconds(typeof declared.ttl === 'function' ? declared.ttl(input) : declared.ttl)
  if (seconds === undefined) return { invalidTtl: true }
  const actsAs = declared.actsAs ?? []
  return { cache, use: declared.use ?? 'return', key: declared.key ?? 'reads', seconds, identity: { ...connection, saver: actsAs.includes('records'), enabler: actsAs.includes('mailbox') }, actsAs }
}
