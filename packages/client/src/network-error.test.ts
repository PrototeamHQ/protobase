import { describe, expect, it } from 'vitest'
import { NetworkError, reportingNoAnswer } from './network-error'

describe('reportingNoAnswer', () => {
  it('rejects with NetworkError, still a TypeError, when fetch gets no answer', async () => {
    const offline = reportingNoAnswer(() => Promise.reject(new TypeError('Failed to fetch')))
    const failure = await offline('/x').catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(NetworkError)
    expect(failure).toBeInstanceOf(TypeError)
  })

  it('passes other rejections on as they are', async () => {
    const aborted = new DOMException('stopped', 'AbortError')
    await expect(reportingNoAnswer(() => Promise.reject(aborted))('/x')).rejects.toBe(aborted)
  })

  it('answers as fetch does', async () => {
    const response = new Response('ok')
    await expect(reportingNoAnswer(async () => response)('/x')).resolves.toBe(response)
  })
})
