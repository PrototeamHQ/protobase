import { describe, expect, it } from 'vitest'
import { ApiError, PreconditionFailedError, type BatchOp } from '@protobase/client'
import { describeBatchFailure, nameFailingOperation } from './batch-failure'

const ops: BatchOp[] = [
  { op: 'update', resource: 'invoices', key: 2, data: { status: 'sent' }, etag: '"a"' },
  { op: 'reorder', resource: 'invoiceLines', field: 'position', keys: [1, 2], etags: { 1: '"b"', 2: '"c"' } },
]

const problem = (extra: object = {}) => ({ type: 'urn:protobase:problem:invalid-record', title: 'Bad Request', status: 400, detail: 'Position is taken.', ...extra })

describe('describeBatchFailure', () => {
  it('names the failing operation', () => {
    expect(describeBatchFailure(new ApiError(problem({ operation: 1 })), ops)).toBe('Operation 2 (reorder invoiceLines by position) failed: Position is taken. Nothing was saved.')
  })

  it('finds the operation in the error list too', () => {
    expect(describeBatchFailure(new ApiError(problem({ errors: [{ message: 'x', operation: 0 }] })), ops)).toContain('Operation 1 (update invoices)')
  })

  it('still says nothing was saved when the operation is unknown', () => {
    expect(describeBatchFailure(new ApiError(problem()), ops)).toBe('Position is taken. Nothing was saved.')
  })
})

describe('nameFailingOperation', () => {
  it('keeps a 412 a 412', () => {
    const named = nameFailingOperation(new PreconditionFailedError(problem({ status: 412, operation: 0 })), ops)
    expect(named).toBeInstanceOf(PreconditionFailedError)
    expect(named.message).toContain('Operation 1 (update invoices)')
  })
})
