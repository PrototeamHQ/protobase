import { describe, expect, it } from 'vitest'
import { setUndo } from './set-undo'

const before = { id: 1, lane: 'queued' }
const written = { record: { id: 1, lane: 'parked' }, etag: '"returned"' }

describe('setUndo', () => {
  it('sends the ETag of the record read again while it still holds the value the drop saved', () => {
    expect(setUndo(before, 'lane', 'parked', written, { record: { id: 1, lane: 'parked', status: 'parked' }, etag: '"reread"' }).etag).toBe('"reread"')
  })

  it("sends the update's own ETag once someone else changed the value in between, so Undo is refused", () => {
    expect(setUndo(before, 'lane', 'parked', written, { record: { id: 1, lane: 'queued' }, etag: '"theirs"' }).etag).toBe('"returned"')
  })
})
