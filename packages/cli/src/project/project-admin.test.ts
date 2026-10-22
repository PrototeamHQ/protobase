import { describe, expect, it, vi } from 'vitest'
import { createAdmin } from '@protobase/server'
import { projectAdmin } from './project-admin'

vi.mock('@protobase/server', async (real) => {
  const server = await real<typeof import('@protobase/server')>()
  return { ...server, createAdmin: vi.fn(server.createAdmin) }
})

describe('projectAdmin', () => {
  it('hands options.mcp false to createAdmin as it is, as dev and serve build the app', () => {
    const authenticate = () => ({ user: { id: 1, roles: [] } })
    projectAdmin({ authenticate, options: { mcp: false } }, {}, {} as never)
    expect(vi.mocked(createAdmin).mock.calls[0]![0].options!.mcp).toBe(false)
  })
})
