import { appPlugin } from '@protobase/workflow-plugins'
import { ConnectionError, type JsonSchema, type Plugin, type ReadyTrigger } from '@protobase/workflows/plugin'
import { loadPlugins, stepHandlers, triggerChecks, typeList, type CheckOptions, type LoadedPlugin, type TaskHandlers, type TriggerCheck, type Unavailable } from '@protobase/workflows'
import type { ResourceModel } from '@protobase/schema'
import type { Mailer } from '../mail/mail-message'
import { pluginServices, type ServicesInput } from './plugin-services'
import { readyProblems } from './ready/ready-check'

// What this version of the app cannot run yet: a type that signs in, and triggers that poll or take webhook calls.
const unavailable: Unavailable = (type) => {
  if (type.connection) return 'It signs in through a connection, which this app cannot make yet'
  if (type.kind === 'polling' || type.kind === 'webhook') return `This app does not run ${type.kind} triggers yet`
  return
}

// The connection a step declared: none can be made yet, so it gives no token.
const noConnection = (stepId: string, name: string) => ({
  accessToken: () => Promise.reject(new ConnectionError('not_connected', `${stepId} signs in through "${name}", and this workflow has no sign-in for it`)),
})

// The arguments a type's input schema requires, which a save refuses a Task without.
const requiredInputs = (input: JsonSchema) => (Array.isArray(input.required) ? (input.required as string[]) : [])

/** The ready triggers of `plugins`, by id. */
export const readyTriggers = (plugins: readonly Plugin[]) =>
  new Map(plugins.flatMap((plugin) => Object.entries(plugin.triggers ?? {}).flatMap(([key, type]): [string, ReadyTrigger][] => (type.kind === 'ready' ? [[`${plugin.name}:${key}`, type]] : []))))

type Models = (name: string) => ResourceModel | undefined

/**
 * The trigger and step types of an app: the built-in plugin, `app`, then the app's own, all through the same loader and
 * interface. `types` is the list the MCP tools and the editor read; `check` is what a save checks a definition against,
 * the available types only, and `checkWith` the same check against other resources, such as those a caller may read.
 */
export const workflowTypes = (loaded: readonly LoadedPlugin[] = [], models: Models = () => undefined) => {
  const plugins = loadPlugins([{ plugin: appPlugin, source: '@protobase/workflow-plugins' }, ...loaded])
  const types = typeList(plugins, unavailable)
  // Trigger types only: a step's id never makes a trigger available.
  const available = new Set(types.filter((type) => type.kind !== 'step' && type.available).map((type) => type.id))
  const ready = readyTriggers(plugins)
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
    }
  }
  const check = checkWith(models)
  /** The step types of one segment, which sends mail with the mailer of the job that runs it. */
  const tasks = (input: ServicesInput, mail: Mailer | undefined): TaskHandlers => stepHandlers(plugins, { services: pluginServices(input, mail), connection: noConnection })
  return { plugins, types, check, checkWith, tasks, ready }
}

export type WorkflowTypes = ReturnType<typeof workflowTypes>
