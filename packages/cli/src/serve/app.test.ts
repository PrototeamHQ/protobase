import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Admin } from '@protobase/server'
import { createServeApp } from './app'

afterEach(() => vi.restoreAllMocks())

describe('createServeApp', () => {
  it('logs a webhook call without the key in its address', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
    const admin = new Hono().post('/api/workflows/hooks/:key', (c) => c.body(null, 202)) as unknown as Admin
    const app = createServeApp({ admin, requestLog: true })
    await app.request('/api/workflows/hooks/the-secret-key?x=1', { method: 'POST' })
    expect(lines).toHaveLength(2)
    expect(lines.join('\n')).not.toContain('the-secret-key')
    expect(lines[0]).toContain('/api/workflows/hooks/[key]?x=1')
  })
})
