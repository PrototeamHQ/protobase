import { ApiError, type BatchOp } from '@protobase/client'

const label = (op: BatchOp) => {
  const resource = typeof op.resource === 'string' ? op.resource : op.resource.toModel().name
  return op.op === 'reorder' ? `reorder ${resource} by ${op.field}` : `${op.op} ${resource}`
}

/** "Operation 2 (reorder invoiceLines by position) failed: ..." so the person knows which part was refused. */
export const describeBatchFailure = (error: ApiError, ops: BatchOp[]) => {
  const index = error.operation
  const op = index === undefined ? undefined : ops[index]
  return op ? `Operation ${index! + 1} (${label(op)}) failed: ${error.message} Nothing was saved.` : `${error.message} Nothing was saved.`
}

/** The same error with the failing operation named in its message, keeping its class so a 412 stays a 412. */
export const nameFailingOperation = (error: ApiError, ops: BatchOp[]) => {
  const named = new (error.constructor as typeof ApiError)({ ...error.problem, detail: describeBatchFailure(error, ops) })
  return named
}
