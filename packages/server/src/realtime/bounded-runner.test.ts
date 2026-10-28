import { describe, expect, it } from 'vitest'
import { boundedRunner } from './bounded-runner'

const deferred = () => {
  let resolve = () => {}
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

describe('boundedRunner', () => {
  it('runs one at a time, lets a few wait, and refuses the rest', async () => {
    const runner = boundedRunner(1, 1)
    const order: string[] = []
    const first = deferred()
    const a = runner.run(async () => (order.push('a'), await first.promise, 'a'))
    const b = runner.run(async () => (order.push('b'), 'b'))
    expect(await runner.run(async () => 'c')).toEqual({ refused: true })
    expect(order).toEqual(['a'])
    first.resolve()
    expect(await a).toEqual({ refused: false, value: 'a' })
    expect(await b).toEqual({ refused: false, value: 'b' })
    expect(order).toEqual(['a', 'b'])
  })

  it('frees its place when a task fails', async () => {
    const runner = boundedRunner(1, 0)
    await expect(runner.run(async () => Promise.reject(new Error('failed')))).rejects.toThrow('failed')
    expect(await runner.run(async () => 1)).toEqual({ refused: false, value: 1 })
  })
})
