import { describe, expect, it } from 'vitest'
import { servedProject } from './load-bundle'

const authenticate = () => ({ user: { id: 1, roles: ['admin'] } })

describe('servedProject', () => {
  it('accepts a default export with config and authenticate', () => {
    const project = { config: {}, authenticate, options: { statementTimeoutMs: 1 } }
    expect(servedProject({ default: project }, 'bundle.js')).toBe(project)
  })

  it('refuses a module without a default export', () => {
    expect(() => servedProject({}, 'bundle.js')).toThrow('bundle.js has no default export; build it with `protobase build`')
  })

  it('refuses a default export without config', () => {
    expect(() => servedProject({ default: { authenticate } }, 'bundle.js')).toThrow('bundle.js has no `config`')
  })

  it('accepts the default basePath and refuses another, which the bundle\'s UI and manifest do not reach', () => {
    const project = { config: {}, authenticate, options: { basePath: '/api/v1' } }
    expect(servedProject({ default: project }, 'bundle.js')).toBe(project)
    expect(() => servedProject({ default: { ...project, options: { basePath: '/admin/v1' } } }, 'bundle.js')).toThrow(
      'options.basePath is "/admin/v1"; a bundle\'s UI and manifest expect the API at /api/v1',
    )
  })

  it('refuses a project without an authenticator', () => {
    expect(() => servedProject({ default: { config: {} } }, 'bundle.js')).toThrow('No authenticator')
  })
})
