import type { BlockState } from '../definition/types'
import { resources } from '../definition/used-connections'
import { limits } from '../limits'
import { nestingDepth } from '../nesting'
import { blockKey } from './cache/block-key'
import type { CacheEntry, CacheIdentity } from './cache/cache-port'
import { cacheSeconds } from './cache/cache-ttl'
import { tolerant } from './cache/tolerant'
import { StepError } from './errors'
import { evaluateKept, evaluateTemplate } from './evaluate'
import { jsonBytes } from './json-bytes'
import type { BlockRun, BlockShare, TaskContext } from './port'
import { redacted } from './redact'
import type { Ran } from './ran'
import type { StateCall } from './step-input'

/** Who a block's entry is kept under: the run's tenant, its version's saver and enabler, and every account it binds. */
const identity: CacheIdentity = { saver: true, enabler: true, bindings: true }

/** What a block's entry keeps: its result, absent when it gave none, and the block's run that made it. */
type Kept = { value?: unknown; run: string }

const taskContext = (call: StateCall): TaskContext => ({
  runId: call.context.runId,
  signal: call.context.signal,
  idempotencyKey: `${call.context.runId}/${call.scope}/${call.position.seq}`,
  log: (message) => void call.logs.push({ at: call.context.now().toISOString(), message: call.context.redactor.text(message) }),
  redact: call.context.redactor.text,
  secret: call.context.redactor.add,
})

// An earlier result never outlives the run's right to the accounts its steps signed in with, as a cached step's does not.
const connected = async (state: BlockState, call: StateCall) => {
  for (const type of new Set(resources(state.Processor))) {
    const check = call.context.tasks[type]?.connected
    if (check && !(await check(taskContext(call)))) return false
  }
  return true
}

// The input of the block's run: its Arguments, which may hold no secret, as the run keeps its input as it is.
const blockInput = async (state: BlockState, call: StateCall) => {
  const args = await evaluateTemplate(state.Arguments ?? {}, call.bindings, 'Arguments')
  if (JSON.stringify(call.context.redactor.value(args)) !== JSON.stringify(args)) throw new StepError('States.Runtime', "Arguments: holds a secret's value, which the block's run would keep; read the secret inside the block as $states.context.Secrets.<NAME>")
  const bytes = jsonBytes(args)
  if (bytes > limits.inputBytes) throw new StepError('States.DataLimitExceeded', `Arguments: ${bytes} bytes as JSON, over the ${limits.inputBytes / 1024} KiB a run's input may be`)
  if (nestingDepth(args, limits.inputDepth) > limits.inputDepth) throw new StepError('States.DataLimitExceeded', `Arguments: nest more than ${limits.inputDepth} levels`)
  return args
}

const hit = (entry: CacheEntry, input: unknown, call: StateCall): Ran => {
  const kept = entry.output as Kept
  call.logs.push({ at: call.context.now().toISOString(), message: `An earlier result from ${entry.cachedAt.toISOString()} was in the cache` })
  return { result: kept.value ?? null, input, recorded: true, fetchedAt: entry.cachedAt, run: kept.run, reused: true }
}

// A block's run that ended: its result, kept for later visits unless it held a secret, or its failure.
const ended = async (run: BlockRun, input: unknown, call: StateCall, keep: (kept: Kept) => Promise<unknown>): Promise<Ran> => {
  if (run.status === 'failed') return { failure: { Error: run.error ?? 'States.Runtime', Cause: run.cause ?? '' }, input, recorded: true, run: run.id }
  if (run.blanked) call.logs.push({ at: call.context.now().toISOString(), message: "The result was not cached: its run's output held a secret" })
  else await keep({ ...(run.output !== undefined && run.output !== null && { value: run.output }), run: run.id })
  const fetchedAt = run.finishedAt ?? call.context.now()
  call.logs.push({ at: call.context.now().toISOString(), message: `The block's run fetched its result at ${fetchedAt.toISOString()}` })
  return { result: run.output ?? null, input, recorded: true, fetchedAt, run: run.id }
}

/**
 * One try of a Block: the result of an earlier run of it with the same key and identity while that entry serves, else
 * the run of it with that key and identity under way, which this run joins, else a run of its own on its Arguments.
 * This run waits for either. Each try starts or joins at most one run, which a later segment of the try finds again; a
 * result, an empty one too, is kept for `Cache.Ttl`, and a failure is not.
 */
export const runBlock = async (state: BlockState, call: StateCall): Promise<Ran> => {
  const input = await blockInput(state, call)
  const recordedInput = redacted(input)
  if (call.context.replay) return { held: true, input: recordedInput }
  const blocks = call.context.blocks
  if (!blocks) throw new StepError('States.Runtime', 'This app keeps no runs of blocks')
  const waiting: Ran = { kind: 'blocked', until: new Date(call.context.now().getTime() + limits.blockWaitSeconds * 1000) }
  const visit = `${call.scope}|${call.position.seq}`
  const task = taskContext(call)
  const cache = call.context.cache
  const custom = state.Cache.Key === undefined ? undefined : { value: await evaluateKept(state.Cache.Key, call.bindings, 'Cache.Key') }
  const key = cache && (await blockKey(state, input, custom, cache.nameSecrets))
  const keep = async (kept: Kept) => {
    const seconds = cacheSeconds(state.Cache.Ttl)
    if (!cache || !key || seconds === undefined) return
    await tolerant(task, 'be written', () => cache.store.write({ runId: call.context.runId, type: key.type, identity, key: key.key, shape: { custom: true }, output: kept, seconds, secrets: key.secrets }))
  }
  // A run that ended gives its outcome; one another run started gives its result only while this run's accounts can
  // still be used, as a cache hit does, and otherwise this run starts its own.
  const take = async (run: BlockRun): Promise<Ran> => {
    if (run.status !== 'succeeded' && run.status !== 'failed') return waiting
    if (run.joined && run.status === 'succeeded' && !(await connected(state, call))) return begin()
    return ended(run, recordedInput, call, keep)
  }
  // Starts a run of the block, or with `share` joins one of the same key and identity under way, which may have ended
  // by the time it is joined.
  const begin = async (share?: BlockShare): Promise<Ran> => {
    const count = await blocks.count()
    if (count >= limits.blockRuns) throw new StepError('States.DataLimitExceeded', `The run started ${count} runs of blocks, the most one run may start (${limits.blockRuns})`)
    const run = await blocks.start({ visit, state: call.name, input, ...(share && { share }) })
    if (!run) throw new StepError('States.Runtime', `"${call.name}" is not a Block of the version this run runs`)
    return take(run)
  }
  const started = await blocks.find(visit)
  if (started) return take(started)
  const entry = cache && key ? await tolerant(task, 'be read', () => cache.store.lookup({ runId: call.context.runId, type: key.type, identity, keys: [key.key] })) : undefined
  // A secret the result depends on that changed since makes it one to fetch again.
  if (entry && entry.secretsChanged.length === 0 && (await connected(state, call))) return hit(entry, recordedInput, call)
  // Only a block whose result is kept shares its run: one that keeps none runs on each visit.
  return begin(key && cacheSeconds(state.Cache.Ttl) !== undefined ? { key: key.key, identity } : undefined)
}
