import { describe, expect, it } from 'vitest'
import { ApiError } from '@protobase/client'
import { f, resource } from '@protobase/schema'
import { checkReason } from './check-reason'

const tasks = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer(), title: f.text() })
  .primaryKey((r) => r.id)
  .checks({ tasks_parked_by_hand: { label: '{title} waits for a day, so it stays parked.' } })
  .toModel()
const refused = (errors: { field: string; code: string; message: string }[]) =>
  new ApiError({ type: 'urn:protobase:problem:invalid-record', title: 'Bad Request', status: 400, detail: 'The database check refused the record', errors })
const record = { id: 2, title: 'Call the supplier' }

describe('checkReason', () => {
  it("gives a declared check's label with the record's values", () => {
    const error = refused([{ field: '_record', code: 'tasks_parked_by_hand', message: '{title} waits for a day, so it stays parked.' }])
    expect(checkReason(error, [tasks], record, 'en')).toBe('Call the supplier waits for a day, so it stays parked.')
  })

  it('gives the generic refusal for a check no resource declares, never the message the answer carries', () => {
    const error = refused([{ field: '_record', code: 'tasks_lane', message: 'Lane rule' }])
    expect(checkReason(error, [tasks], record, 'en')).toBe('The database refused this change.')
  })

  it("leaves other refusals to their own reason, a rule's or a field's", () => {
    expect(checkReason(refused([{ field: '_record', code: 'invalid-record', message: 'Pick a lane' }]), [tasks], record, 'en')).toBeUndefined()
    expect(checkReason(refused([{ field: 'title', code: 'required', message: '"title" is required' }]), [tasks], record, 'en')).toBeUndefined()
    expect(checkReason(new Error('offline'), [tasks], record, 'en')).toBeUndefined()
  })
})
