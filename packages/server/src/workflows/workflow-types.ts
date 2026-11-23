import type { JsonSchema, Plugin, PluginTemplate, PollingTrigger, ReadyTrigger, TriggerType, WebhookTrigger } from '@protobase/workflows/plugin'
import { connectionUnavailable, loadPlugins, stepHandlers, triggerChecks, typeList, type CatalogTemplate, type CheckOptions, type ConnectionSupport, type EmailSchemas, type LoadedPlugin, type StepWiring, type TaskHandlers, type TriggerCheck, type TypeEntry } from '@protobase/workflows'
import type { ResourceModel } from '@protobase/schema'
import type { Locale } from '@protobase/schema/internal'
import { keyTypes, recordJsonSchema } from '@protobase/schema/internal'
import type { Mailer } from '../mail/mail-message'
import { workflowPlugins } from './default-plugins'
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

/** The step that sends one of the app's email templates, which takes one by its name. */
export const templateStep = 'app:mail.template'

// The template step's `template` as one of the app's templates' names, so the list and the editor offer them
const withTemplateNames = (types: TypeEntry[], names: readonly string[]) =>
  names.length === 0
    ? types
    : types.map((type) => {
        if (type.id !== templateStep) return type
        const properties = type.input.properties as Record<string, JsonSchema>
        return { ...type, input: { ...type.input, properties: { ...properties, template: { ...properties.template, enum: [...names] } } } }
      })

/**
 * The trigger and step types of an app: the default plugins, then the app's own, all through the same loader and
 * interface. `types` is the list the MCP tools and the editor read; `check` is what a save checks a definition against,
 * the available types only, and `checkWith` the same check against other resources, such as those a caller may read;
 * `checkFor` is `check` for a workflow of this tenant, which a ready trigger on a resource without a tenant field never
 * reaches; its words are in the app's `locale`, else English.
 * A type that signs in is available once the app can make its connection, as `support` says. `app:mail.template`
 * takes one of `templates`, the app's email templates, by name, its data as that template's schema says;
 * `templates` lists them as the type list's readers see them.
 */
export const workflowTypes = (loaded: readonly LoadedPlugin[] = [], models: Models = () => undefined, support?: ConnectionSupport, mailTemplates: readonly PluginTemplate[] = [], locale?: Locale) => {
  const plugins = loadPlugins(workflowPlugins(loaded))
  const types = withTemplateNames(typeList(plugins, connectionUnavailable(support)), mailTemplates.map((template) => template.name))
  const templates: CatalogTemplate[] = mailTemplates.map((template) => ({ name: template.name, languages: [...template.languages], schema: template.dataSchema }))
  const emails: EmailSchemas = (name) => {
    const found = templates.find((template) => template.name === name)
    return found && { schema: found.schema, languages: found.languages }
  }
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
  // A ready trigger is checked against the resources of `against` too, once its input fits its schema, and against
  // being a tenant's workflow (`tenanted`).
  const checkWith = (against: Models, tenanted = false): CheckOptions => {
    const checks = Object.entries(own).map(([id, check]): [string, TriggerCheck] => {
      const declared = ready.get(id)
      if (!declared) return [id, check]
      return [id, (input) => {
        const problems = check(input)
        return problems.length > 0 ? problems : readyProblems(against, declared.ready(input), tenanted, locale)
      }]
    })
    return {
      resources: steps.map((type) => type.id),
      required: Object.fromEntries(steps.map((type) => [type.id, requiredInputs(type.input)])),
      triggers: Object.fromEntries(checks.filter(([id]) => available.has(id))),
      unavailable: reasons,
      connections,
      // An argument that reads a value by name takes its type, by the types' schemas and the records of `against`
      pins: {
        inputs: Object.fromEntries(steps.map((type) => [type.id, type.input])),
        outputs: Object.fromEntries(types.flatMap((type) => (type.output ? [[type.id, type.output]] : []))),
        records: (resource, use) => {
          const model = against(resource)
          return model && recordJsonSchema(model, use, model.name, keyTypes(against))
        },
        emails,
      },
    }
  }
  const check = checkWith(models)
  const tenantCheck = checkWith(models, true)
  const checkFor = (tenant: unknown) => (tenant === null || tenant === undefined ? check : tenantCheck)
  /** The step types of one segment, which sends mail with the mailer of the job that runs it, signs in through `connection`, and sends from the enabler's `mailbox`. */
  const tasks = (input: ServicesInput, mail: Mailer | undefined, connection: StepWiring['connection'], mailbox?: StepWiring['mailbox']): TaskHandlers =>
    stepHandlers(plugins, { services: pluginServices(input, mail), connection, ...(mailbox && { mailbox }) })
  return { plugins, types, templates, check, checkWith, checkFor, tasks, ready, polling, webhooks, connections, available: (id: string) => available.has(id) }
}

export type WorkflowTypes = ReturnType<typeof workflowTypes>
