import { describe, expect, it } from 'vitest'
import { tickets, ticketsView } from './tickets'

// The documentation shows these files; this keeps what it says about them true.

describe('the comments on tickets', () => {
  it('lets tickets take comments and shows them last on the ticket page', async () => {
    expect(tickets.toModel().comments).toBe(true)
    expect(ticketsView.toModel().layout.at(-1)).toEqual({ kind: 'comments', title: 'Comments' })
  })
})
