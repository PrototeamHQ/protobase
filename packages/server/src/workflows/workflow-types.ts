import { appPlugin } from '@protobase/workflow-plugins'
import { ConnectionError, type JsonSchema } from '@protobase/workflows/plugin'
import { loadPlugins, stepHandlers, triggerChecks, typeList, type CheckOptions, type LoadedPlugin, type TaskHandlers, type Unavailable } from '@protobase/workflows'
import type { Mailer } from '../mail/mail-message'
import { pluginServices, type ServicesInput } from './plugin-services'

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

/**
 * The trigger and step types of an app: the built-in plugin, `app`, then the app's own, all through the same loader and
 * interface. `types` is the list the MCP tools and the editor read; `check` is what a save checks a definition against,
 * the available types only.
 */
export const workflowTypes = (loaded: readonly LoadedPlugin[] = []) => {
  const plugins = loadPlugins([{ plugin: appPlugin, source: '@protobase/workflow-plugins' }, ...loaded])
  const types = typeList(plugins, unavailable)
  const available = new Set(types.filter((type) => type.available).map((type) => type.id))
  const steps = types.filter((type) => type.kind === 'step' && type.available)
  const check: CheckOptions = {
    resources: steps.map((type) => type.id),
    required: Object.fromEntries(steps.map((type) => [type.id, requiredInputs(type.input)])),
    triggers: Object.fromEntries(Object.entries(triggerChecks(plugins)).filter(([id]) => available.has(id))),
  }
  /** The step types of one segment, which sends mail with the mailer of the job that runs it. */
  const tasks = (input: ServicesInput, mail: Mailer | undefined): TaskHandlers => stepHandlers(plugins, { services: pluginServices(input, mail), connection: noConnection })
  return { plugins, types, check, tasks }
}

export type WorkflowTypes = ReturnType<typeof workflowTypes>
