import { describe, expect, it } from 'vitest'
import { tickets, ticketsView } from './tickets'
import project from './protobase.config'

// The documentation shows these files; this keeps what it says about them true.

describe('the comments on tickets', () => {
  it('lets tickets take comments and shows them last on the ticket page', () => {
    expect(tickets.toModel().comments).toBe(true)
    expect(ticketsView.toModel().layout.at(-1)).toEqual({ kind: 'comments', title: 'Comments' })
    expect(project.config).toMatchObject({ tickets, ticketsView })
  })
})
