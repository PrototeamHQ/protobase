import { encrypted } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { configurationProblem } from './configuration-rules'

const withRoot = { root: '/srv/storage', endpoints: ['https://storage.example.com'] }
const noRoot = { endpoints: [] }

describe('configurationProblem', () => {
  it('takes a local folder under a root, and a bucket with or without an allowed endpoint and keys', () => {
    expect(configurationProblem({ kind: 'local', dir: 'invoices' }, withRoot)).toBeUndefined()
    expect(configurationProblem({ kind: 's3', bucket: 'acme-files', region: 'eu-west-1' }, noRoot)).toBeUndefined()
    expect(configurationProblem({ kind: 's3', bucket: 'acme-files', endpoint: 'https://storage.example.com', access_key_id: encrypted, secret_access_key: encrypted }, withRoot)).toBeUndefined()
  })

  it('refuses a local configuration while the app sets no storage root, naming the restriction', () => {
    expect(configurationProblem({ kind: 'local', dir: 'invoices' }, noRoot)).toEqual({ field: 'kind', message: 'This app sets no storage root (workflows.storage.root), so it takes only s3 configurations' })
  })

  it('refuses a folder that leaves the root', () => {
    for (const dir of ['../x', '/srv', '.tmp', '', null]) expect(configurationProblem({ kind: 'local', dir }, withRoot)?.field, String(dir)).toBe('dir')
  })

  it('refuses an endpoint the app does not list, also with a path, and a region or bucket that could steer the host', () => {
    expect(configurationProblem({ kind: 's3', bucket: 'acme-files', endpoint: 'https://127.0.0.1' }, withRoot)?.field).toBe('endpoint')
    expect(configurationProblem({ kind: 's3', bucket: 'acme-files', endpoint: 'https://storage.example.com/x' }, withRoot)?.field).toBe('endpoint')
    expect(configurationProblem({ kind: 's3', bucket: 'acme-files', endpoint: 'https://storage.example.com' }, noRoot)?.message).toBe('This app allows no endpoint: leave it out for the default host')
    expect(configurationProblem({ kind: 's3', bucket: 'acme-files', region: 'x.attacker.example/' }, withRoot)?.field).toBe('region')
    expect(configurationProblem({ kind: 's3', bucket: 'evil.example.com/x' }, withRoot)?.field).toBe('bucket')
  })

  it('refuses one key without the other, and fields of the other kind', () => {
    expect(configurationProblem({ kind: 's3', bucket: 'acme-files', access_key_id: encrypted }, noRoot)?.field).toBe('secret_access_key')
    expect(configurationProblem({ kind: 'local', dir: 'a', bucket: 'acme-files' }, withRoot)?.field).toBe('bucket')
    expect(configurationProblem({ kind: 's3', bucket: 'acme-files', dir: 'a' }, withRoot)?.field).toBe('dir')
  })
})
