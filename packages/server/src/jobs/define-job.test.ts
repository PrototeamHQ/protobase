import { describe, expect, it } from 'vitest'
import { defineJob, jobDefinitions } from './define-job'

const run = () => {}

describe('defineJob', () => {
  it('refuses a name pg-boss cannot take as a queue', () => {
    expect(() => defineJob({ name: 'send invoice', run })).toThrow('Job name "send invoice" may only hold letters, digits')
    expect(defineJob({ name: 'webhooks.deliver/v1', run }).name).toBe('webhooks.deliver/v1')
  })

  it('enqueues only through jobs started in this process', async () => {
    const job = defineJob({ name: 'a', run })
    await expect(job.enqueue({} as never)).rejects.toThrow('Jobs are not running in this process')
  })
})

describe('jobDefinitions', () => {
  it("takes the jobs among a module's exports, each once", () => {
    const a = defineJob({ name: 'a', run })
    const b = defineJob({ name: 'b', run })
    expect(jobDefinitions({ a, b, again: a, other: 1, helper: () => {} })).toEqual([a, b])
  })

  it('refuses two jobs of one name', () => {
    expect(() => jobDefinitions({ one: defineJob({ name: 'a', run }), two: defineJob({ name: 'a', run }) })).toThrow('Two jobs are named "a"')
  })
})
