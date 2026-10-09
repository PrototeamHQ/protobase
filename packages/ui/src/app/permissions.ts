import type { RecordPermissions, ResourcePermissions } from '@protobase/client'

export type Operation = 'create' | 'update' | 'delete'

/**
 * Whether to offer an operation: yes when allowed outright, and also when only some records qualify
 * (`conditional`), because then the server decides per record and a 403 is reported when it says no.
 */
export const can = (permissions: ResourcePermissions, operation: Operation) => permissions[operation] || permissions.conditional.includes(operation)

/** List rows carry `permissions: { update, delete }`; a row without them (the server was not asked) is allowed, and every write is checked again. */
export const rowAllows = (row: Record<string, unknown>, operation: 'update' | 'delete') => (row.permissions as { update: boolean; delete: boolean } | undefined)?.[operation] ?? true

/** One field on one record: `edit`, `read`, or `hidden` (absent from a get response's `permissions.fields`). Without that map the model decides. */
export const fieldAccess = (permissions: RecordPermissions | undefined, name: string): 'edit' | 'read' | 'hidden' => {
  if (!permissions?.fields) return 'edit'
  return permissions.fields[name] ?? 'hidden'
}
