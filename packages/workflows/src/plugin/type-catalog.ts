import type { JsonSchema } from './context'
import type { TypeEntry } from './type-list'

/** A type as a model or the editor reads it: its declaration as its plugin gives it, with whether this app can run it. */
export type CatalogEntry = Omit<TypeEntry, 'kind' | 'plugin'> & { kind: TypeEntry['kind'] | 'manual' }

const entry = ({ plugin: _, ...type }: TypeEntry): CatalogEntry => type

/** `manual`, the trigger of a workflow that runs only when someone starts it. */
const manual: CatalogEntry = { id: 'manual', kind: 'manual', label: 'By hand', description: 'Runs when someone starts it, such as with run_workflow, with the input they give.', input: { type: 'object', additionalProperties: false }, available: true }

/** An email template of the app as the catalog lists it: its name, the languages it is sent in, and the JSON Schema of its data. */
export type CatalogTemplate = { name: string; languages: string[]; schema: JsonSchema }

/**
 * What `list_workflow_types` answers and the editor reads: every step type a Task names as its `Resource` and every
 * trigger a definition's `trigger` holds as `{ "<id>": <input> }`, built-in and plugin types alike, each with its JSON
 * Schemas, and the app's email templates, whose data `app:mail.template` takes.
 */
export const typeCatalog = (types: readonly TypeEntry[], templates: readonly CatalogTemplate[] = []): TypeCatalog => ({
  step_types: types.filter((type) => type.kind === 'step').map(entry),
  triggers: [manual, ...types.filter((type) => type.kind !== 'step').map(entry)],
  ...(templates.length > 0 && { templates: [...templates] }),
  note: 'A definition holds its trigger as { "<id>": <input> }, such as { "app:record": { "resource": "orders" } }. A type with available false cannot be saved here; its reason says why. A trigger other than manual starts runs only while its workflow is enabled, on its enabled_version, as enable_workflow sets it, which a later save leaves as it is; run_workflow starts a run of any workflow, enabled or not, on the version saved last, so a manual workflow needs no enabled_version.',
})

/** The app's types, `manual` first among the triggers, and its email templates, as `typeCatalog` lists them. */
export type TypeCatalog = { step_types: CatalogEntry[]; triggers: CatalogEntry[]; templates?: CatalogTemplate[]; note: string }
