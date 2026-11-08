import type { FieldType } from './model'

/**
 * The field types Protobase brings, which a view chooses with `.widget(name)` like a plugin's, by the storage types
 * each shows: `json`, any JSON value edited as JSON text, `members`, a JSON array of the user ids of an organization's members, `workflow`, a workflow's
 * definition drawn as a graph to edit, `workflow_run`, a run's id, drawn as its steps on its workflow's graph, and
 * `workflow_status`, a workflow's status from its last runs, said in words with the run it names. A plugin's of the same name wins.
 */
export const builtInFieldTypes = { json: ['json'], members: ['json'], workflow: ['json'], workflow_run: ['uuid'], workflow_status: ['enum'] } as const satisfies Readonly<Record<string, readonly FieldType[]>>
