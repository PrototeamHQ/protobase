import type { ResourcePermissions } from '@protobase/client'
import { evaluateCondition, parseCondition } from '@protobase/layout'
import type { ConversationPageModel } from '@protobase/schema'
import { can, rowAllows } from '../permissions'

type Row = Record<string, unknown>

// Delete is offered unless its condition holds for the message; one that does not parse keeps every message
const deleteAllowed = (option: ConversationPageModel['delete'], row: Row) => {
  if (option === undefined || option === false) return false
  if (option === true) return true
  const condition = parseCondition(option.unless)
  return condition.ok && !evaluateCondition(condition, row)
}

/**
 * What the reader may do to a message, as far as the page can tell: edit their own (`mine`) when the conversation lets
 * authors edit, and delete one when it lets anyone and its condition does not keep the message, each only where the
 * resource's access and the row's own permissions allow it. The server checks every write again.
 */
export const messageAccess = (page: Pick<ConversationPageModel, 'edit' | 'delete'>, row: Row, mine: boolean, permissions: ResourcePermissions) => ({
  edit: page.edit === true && mine && can(permissions, 'update') && rowAllows(row, 'update'),
  delete: deleteAllowed(page.delete, row) && can(permissions, 'delete') && rowAllows(row, 'delete'),
})

/** Whether the reader may react, and take back their own reactions, by the reaction resource's access. */
export const reactionAccess = (permissions: ResourcePermissions) => ({ react: can(permissions, 'create'), unreact: can(permissions, 'delete') })
