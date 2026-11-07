import { Ajv } from 'ajv'
import { StepError } from '../run/errors'
import type { TaskContext, TaskHandler, TaskHandlers } from '../run/port'
import type { PluginConnection, PluginMail, PluginServices } from './context'
import { cachePlan } from './cache-plan'
import { cachedRun, reuse, type CallParts } from './cached-run'
import type { Plugin, StepType } from './types'
import { writesFor } from './writes'

const ajv = new Ajv({ allErrors: true, strict: false })

/** What the app gives each step: its services for this run, and the connection a step declared. */
export type StepWiring = {
  services: (task: TaskContext) => PluginServices
  connection: (stepId: string, name: string, task: TaskContext) => PluginConnection
  /** The mailbox of the person who turned the run's version on; none when the app links no mailboxes. */
  mailbox?: (task: TaskContext) => PluginMail | undefined
}

const handler = (id: string, type: StepType, wiring: StepWiring): TaskHandler => {
  const validate = ajv.compile(type.input)
  const prefix = type.errorPrefix ?? 'Step'
  // The runner passes the Arguments as evaluated, `{}` when a Task has none, so an evaluated null is checked as null.
  const call: TaskHandler = async (input, task) => {
    if (!validate(input)) {
      const problems = (validate.errors ?? []).map((error) => `${error.instancePath.slice(1).replaceAll('/', '.') || 'Arguments'} ${error.message}`)
      throw new StepError(`${prefix}.InvalidArguments`, problems.join('; '))
    }
    const connection = type.connection === undefined ? undefined : wiring.connection(id, type.connection, task)
    const { runId, idempotencyKey, signal, log, redact } = task
    const run = ({ services, input, mailbox, earlier }: CallParts) => type.run({ ...services, input, runId, idempotencyKey, signal, log, redact, connection, mailbox, reuse, ...(earlier && { earlier }) })
    const parts = { services: wiring.services(task), input: input as Record<string, unknown>, mailbox: wiring.mailbox?.(task) }
    const plan = cachePlan(id, type, parts.input, task.cache)
    if (plan && 'invalidTtl' in plan) log("The step type's cache gave no valid time to live; the step ran without the cache")
    if (!plan || 'invalidTtl' in plan) return run(parts)
    return cachedRun(plan, id, parts, task, run)
  }
  // Arguments that are not an object are no input the type's `writes` can read: they count as writing.
  return Object.assign(call, { writes: (input: unknown) => (input !== null && typeof input === 'object' && !Array.isArray(input) ? writesFor(type, input as Record<string, unknown>) : true) })
}

/** The runner's step types from the plugins' steps, each checking its input against its schema before it runs. */
export const stepHandlers = (plugins: readonly Plugin[], wiring: StepWiring): TaskHandlers =>
  Object.fromEntries(plugins.flatMap((plugin) => Object.entries(plugin.steps ?? {}).map(([key, type]) => [`${plugin.name}:${key}`, handler(`${plugin.name}:${key}`, type, wiring)])))
