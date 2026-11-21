import { describe, expect, it } from 'vitest'
import { ApiError } from '../problem'
import { ticketRefused } from './relay-ticket'

const problem = (status: number) => new ApiError({ type: 'about:blank', title: 'x', status })

describe('ticketRefused', () => {
  it('ends on a client error, such as an ended session or no relay, and tries again on the rest', () => {
    expect([401, 403, 404].map((status) => ticketRefused(problem(status)))).toEqual([true, true, true])
    expect([408, 429, 500, 503].map((status) => ticketRefused(problem(status)))).toEqual([false, false, false, false])
    expect(ticketRefused(new TypeError('Failed to fetch'))).toBe(false)
  })
})
