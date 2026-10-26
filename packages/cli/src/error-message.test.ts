import { describe, expect, it } from 'vitest'
import { errorMessage } from './error-message'

const refused = (address: string, port: number) => Object.assign(new Error(`connect ECONNREFUSED ${address}:${port}`), { code: 'ECONNREFUSED', address, port })

describe('errorMessage', () => {
  it("is an error's own message", () => {
    expect(errorMessage(new Error('Pass a connection string or --env <VARIABLE>'))).toBe('Pass a connection string or --env <VARIABLE>')
  })

  it('names every address of a refused connection, which has no message of its own', () => {
    const error = new AggregateError([refused('::1', 55999), refused('127.0.0.1', 55999)])
    expect(errorMessage(error)).toBe('Cannot connect to [::1]:55999 or 127.0.0.1:55999: the connection was refused, so nothing is listening there. Is the database running?')
  })

  it('joins the messages of other errors without one of its own', () => {
    expect(errorMessage(new AggregateError([new Error('first'), new Error('second')]))).toBe('first; second')
    expect(errorMessage(new AggregateError([]))).toBe('AggregateError')
  })
})
