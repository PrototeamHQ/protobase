import { Ajv } from 'ajv'
import { StepError } from '../run/errors'
import type { TaskContext, TaskHandler, TaskHandlers } from '../run/port'
import type { PluginConnection, PluginServices } from './context'
import type { Plugin, StepType } from './types'

const ajv = new Ajv({ allErrors: true, strict: false })

/** What the app gives each step: its services for this run, and the connection a step declared. */
export type StepWiring = {
  services: (task: TaskContext) => PluginServices
  connection: (stepId: string, name: string, task: TaskContext) => PluginConnection
}

const handler = (id: string, type: StepType, wiring: StepWiring): TaskHandler => {
  const validate = ajv.compile(type.input)
  const prefix = type.errorPrefix ?? 'Step'
  // The runner passes the Arguments as evaluated, `{}` when a Task has none, so an evaluated null is checked as null.
  return async (input, task) => {
    if (!validate(input)) {
      const problems = (validate.errors ?? []).map((error) => `${error.instancePath.slice(1).replaceAll('/', '.') || 'Arguments'} ${error.message}`)
      throw new StepError(`${prefix}.InvalidArguments`, problems.join('; '))
    }
    const connection = type.connection === undefined ? undefined : wiring.connection(id, type.connection, task)
    const { runId, idempotencyKey, signal, log, redact } = task
    return type.run({ ...wiring.services(task), input: input as Record<string, unknown>, runId, idempotencyKey, signal, log, redact, connection })
  }
}

/** The runner's step types from the plugins' steps, each checking its input against its schema before it runs. */
export const stepHandlers = (plugins: readonly Plugin[], wiring: StepWiring): TaskHandlers =>
  Object.fromEntries(plugins.flatMap((plugin) => Object.entries(plugin.steps ?? {}).map(([key, type]) => [`${plugin.name}:${key}`, handler(`${plugin.name}:${key}`, type, wiring)])))
