import { describe, expect, it } from 'vitest'
import { ApiError } from '@protobase/client'
import { moveRefusal } from './move-refusal'

const changed = new ApiError({ type: 'urn:protobase:problem:precondition-failed', title: 'Precondition Failed', status: 412, detail: 'The list changed where the record was dropped' })

describe('moveRefusal', () => {
  it('warns that the record was not moved and that the list shows the current order, with no word of reloading', () => {
    const toast = moveRefusal(changed, 'Could not change the order', { place: 'list', title: 'Gazelle' })
    expect(toast).toEqual({
      state: 'warning',
      title: 'Gazelle was not moved',
      description: 'The order changed where you dropped it. The list now shows the current order: move it again if you still want it there.',
    })
    expect(JSON.stringify(toast)).not.toMatch(/reload|fetch/i)
  })

  it('names the board on a board, and an undo by its own title', () => {
    expect(moveRefusal(changed, 'Could not change the order', { place: 'board', title: 'Call Emma' }).description).toContain('The board now shows')
    expect(moveRefusal(changed, 'Could not undo', { place: 'board' })).toEqual({ state: 'warning', title: 'Could not undo', description: 'The order changed since. The board now shows the current order.' })
  })

  it('is an error with the server reason for any other refusal', () => {
    const denied = new ApiError({ type: 'urn:protobase:problem:forbidden', title: 'Forbidden', status: 403, detail: 'You may not update products' })
    expect(moveRefusal(denied, 'Could not change the order', { place: 'list', title: 'Gazelle' })).toEqual({ state: 'error', title: 'Could not change the order', description: 'You may not update products' })
  })
})
