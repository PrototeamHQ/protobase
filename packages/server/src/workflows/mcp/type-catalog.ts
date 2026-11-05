import type { TypeEntry } from '@protobase/workflows'

/** A type as a model reads it: its declaration as its plugin gives it, with whether this app can run it. */
type CatalogEntry = Omit<TypeEntry, 'plugin'>

const entry = ({ plugin: _, ...type }: TypeEntry): CatalogEntry => type

/** `manual`, the trigger of a workflow that runs only when someone starts it. */
const manual = { id: 'manual', kind: 'manual', label: 'By hand', description: 'Runs when someone starts it, such as with run_workflow, with the input they give.', input: { type: 'object', additionalProperties: false }, available: true }

/**
 * What `list_workflow_types` answers: every step type a Task names as its `Resource` and every trigger a definition's
 * `trigger` holds as `{ "<id>": <input> }`, built-in and plugin types alike, each with its JSON Schemas.
 */
export const typeCatalog = (types: readonly TypeEntry[]) => ({
  step_types: types.filter((type) => type.kind === 'step').map(entry),
  triggers: [manual, ...types.filter((type) => type.kind !== 'step').map(entry)],
  note: 'A definition holds its trigger as { "<id>": <input> }, such as { "app:record": { "resource": "orders" } }. A type with available false cannot be saved here; its reason says why. A trigger other than manual starts runs only while its workflow is enabled, its enabled_version set; run_workflow starts a run of any workflow, enabled or not, so a manual workflow needs no enabled_version.',
})
