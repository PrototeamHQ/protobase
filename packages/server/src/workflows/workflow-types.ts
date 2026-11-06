import { appPlugin } from '@protobase/workflow-plugins'
import type { JsonSchema, Plugin, PollingTrigger, ReadyTrigger, TriggerType, WebhookTrigger } from '@protobase/workflows/plugin'
import { connectionUnavailable, loadPlugins, stepHandlers, triggerChecks, typeList, type CheckOptions, type ConnectionSupport, type LoadedPlugin, type StepWiring, type TaskHandlers, type TriggerCheck } from '@protobase/workflows'
import type { ResourceModel } from '@protobase/schema'
import type { Mailer } from '../mail/mail-message'
import { pluginServices, type ServicesInput } from './plugin-services'
import { readyProblems } from './ready/ready-check'

// The arguments a type's input schema requires, which a save refuses a Task without.
const requiredInputs = (input: JsonSchema) => (Array.isArray(input.required) ? (input.required as string[]) : [])

/** The triggers of `plugins` of one kind, by id. */
const triggersOfKind = <T extends TriggerType>(plugins: readonly Plugin[], kind: T['kind']) =>
  new Map(plugins.flatMap((plugin) => Object.entries(plugin.triggers ?? {}).flatMap(([key, type]): [string, T][] => (type.kind === kind ? [[`${plugin.name}:${key}`, type as T]] : []))))

/** The ready triggers of `plugins`, by id. */
export const readyTriggers = (plugins: readonly Plugin[]) => triggersOfKind<ReadyTrigger>(plugins, 'ready')

type Models = (name: string) => ResourceModel | undefined

/**
 * The trigger and step types of an app: the built-in plugin, `app`, then the app's own, all through the same loader and
 * interface. `types` is the list the MCP tools and the editor read; `check` is what a save checks a definition against,
 * the available types only, and `checkWith` the same check against other resources, such as those a caller may read.
 * A type that signs in is available once the app can make its connection, as `support` says.
 */
export const workflowTypes = (loaded: readonly LoadedPlugin[] = [], models: Models = () => undefined, support?: ConnectionSupport) => {
  const plugins = loadPlugins([{ plugin: appPlugin, source: '@protobase/workflow-plugins' }, ...loaded])
  const types = typeList(plugins, connectionUnavailable(support))
  // The connection `<plugin>:<connection>` of each type that signs in, by the type's id.
  const connections = Object.fromEntries(types.flatMap((type) => (type.connection ? [[type.id, `${type.plugin}:${type.connection.name}`]] : [])))
  // Trigger types only: a step's id never makes a trigger available.
  const available = new Set(types.filter((type) => type.kind !== 'step' && type.available).map((type) => type.id))
  const ready = readyTriggers(plugins)
  const polling = triggersOfKind<PollingTrigger>(plugins, 'polling')
  const webhooks = triggersOfKind<WebhookTrigger>(plugins, 'webhook')
  const steps = types.filter((type) => type.kind === 'step' && type.available)
  const reasons = Object.fromEntries(types.flatMap((type) => (type.reason === undefined ? [] : [[type.id, type.reason]])))
  const own = triggerChecks(plugins)
  // A ready trigger is checked against the resources of `against` too, once its input fits its schema.
  const checkWith = (against: Models): CheckOptions => {
    const checks = Object.entries(own).map(([id, check]): [string, TriggerCheck] => {
      const declared = ready.get(id)
      if (!declared) return [id, check]
      return [id, (input) => {
        const problems = check(input)
        return problems.length > 0 ? problems : readyProblems(against, declared.ready(input))
      }]
    })
    return {
      resources: steps.map((type) => type.id),
      required: Object.fromEntries(steps.map((type) => [type.id, requiredInputs(type.input)])),
      triggers: Object.fromEntries(checks.filter(([id]) => available.has(id))),
      unavailable: reasons,
      connections,
    }
  }
  const check = checkWith(models)
  /** The step types of one segment, which sends mail with the mailer of the job that runs it, and signs in through `connection`. */
  const tasks = (input: ServicesInput, mail: Mailer | undefined, connection: StepWiring['connection']): TaskHandlers => stepHandlers(plugins, { services: pluginServices(input, mail), connection })
  return { plugins, types, check, checkWith, tasks, ready, polling, webhooks, connections, available: (id: string) => available.has(id) }
}

export type WorkflowTypes = ReturnType<typeof workflowTypes>
