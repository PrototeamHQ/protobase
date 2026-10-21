import { describe, expect, it } from 'vitest'
import { bufferedOf } from './buffered-amount'

const npmWs = (bufferedAmount: unknown) => ({ _sender: {}, _socket: {}, bufferedAmount })

describe('bufferedOf', () => {
  it('reads the unsent bytes of a socket of npm ws only', () => {
    expect(bufferedOf(npmWs(5))).toBe(5)
    expect(bufferedOf(npmWs(0))).toBe(0)
    expect(bufferedOf({ bufferedAmount: 0 })).toBeUndefined()
    expect(bufferedOf({ _sender: {}, bufferedAmount: 0 })).toBeUndefined()
    expect(bufferedOf({})).toBeUndefined()
    expect(bufferedOf(null)).toBeUndefined()
    expect(bufferedOf(npmWs('5'))).toBeUndefined()
    expect(bufferedOf(npmWs(NaN))).toBeUndefined()
    expect(bufferedOf(npmWs(Infinity))).toBeUndefined()
  })
})
