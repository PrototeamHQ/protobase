import type { FieldType } from './model'

/**
 * The field types Protobase brings, which a view chooses with `.widget(name)` like a plugin's, by the storage types
 * each shows: `json`, any JSON value edited as JSON text, `members`, a JSON array of the user ids of an organization's members, `workflow`, a workflow's
 * definition drawn as a graph to edit, `workflow_run`, a run's id, drawn as its steps on its workflow's graph,
 * `workflow_status`, a workflow's status from its last runs, said in words with the run it names, `custom_step_container`,
 * a custom step's Dockerfile, the files beside it and its command, each shown and edited as code, and `runner_install`, a
 * runner's id, with a button that issues its one-time install command to copy. A plugin's of the same name wins.
 */
export const builtInFieldTypes = { json: ['json'], members: ['json'], workflow: ['json'], workflow_run: ['uuid'], workflow_status: ['enum'], custom_step_container: ['json'], runner_install: ['uuid'] } as const satisfies Readonly<Record<string, readonly FieldType[]>>
