import type { FieldType } from './model'

/**
 * The field types Protobase brings, which a view chooses with `.widget(name)` like a plugin's, by the storage types
 * each shows: `members`, a JSON array of the user ids of an organization's members, and `workflow`, a workflow's
 * definition drawn as a graph to edit. A plugin's of the same name wins.
 */
export const builtInFieldTypes = { members: ['json'], workflow: ['json'] } as const satisfies Readonly<Record<string, readonly FieldType[]>>
