import { ApiError, type BatchOp } from '@protobase/client'
import { text as appText } from './messages'

const label = (op: BatchOp) => {
  const resource = typeof op.resource === 'string' ? op.resource : op.resource.toModel().name
  return op.op === 'reorder' ? `reorder ${resource} by ${op.field}` : `${op.op} ${resource}`
}

/** "Operation 2 (reorder invoice_lines by position) failed: ..." so the person knows which part was refused. */
export const describeBatchFailure = (error: ApiError, ops: BatchOp[]) => {
  const index = error.operation
  const op = index === undefined ? undefined : ops[index]
  return op ? appText('operationFailed', index! + 1, label(op), error.message) : appText('nothingSaved', error.message)
}

/** The same error with the failing operation named in its message, keeping its class so a 412 stays a 412. */
export const nameFailingOperation = (error: ApiError, ops: BatchOp[]) => {
  const named = new (error.constructor as typeof ApiError)({ ...error.problem, detail: describeBatchFailure(error, ops) })
  return named
}
