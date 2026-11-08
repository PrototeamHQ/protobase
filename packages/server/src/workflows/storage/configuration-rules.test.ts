import { encrypted } from '@protobase/schema'
import { describe, expect, it } from 'vitest'
import { configurationProblem } from './configuration-rules'

const withRoot = { root: '/srv/storage', endpoints: ['https://storage.example.com'] }
const noRoot = { endpoints: [] }
const bucket = { kind: 's3', bucket: 'acme-files', region: 'eu-west-1', endpoint: 'https://storage.example.com' }

describe('configurationProblem', () => {
  it('takes a local folder under a root, and a bucket with its region, an allowed endpoint and keys or none yet', () => {
    expect(configurationProblem({ kind: 'local', dir: 'invoices' }, withRoot)).toBeUndefined()
    expect(configurationProblem({ ...bucket }, withRoot)).toBeUndefined()
    expect(configurationProblem({ ...bucket, access_key_id: encrypted, secret_access_key: encrypted }, withRoot)).toBeUndefined()
  })

  it('refuses a bucket without a region or endpoint, which the S3 client would take from the environment', () => {
    expect(configurationProblem({ ...bucket, region: null }, withRoot)?.field).toBe('region')
    expect(configurationProblem({ ...bucket, endpoint: undefined }, withRoot)?.field).toBe('endpoint')
    expect(configurationProblem({ ...bucket }, noRoot)).toEqual({ field: 'endpoint', message: 'This app allows no endpoint (workflows.storage.endpoints), so it takes no s3 configuration' })
  })

  it('refuses a local configuration while the app sets no storage root, naming the restriction', () => {
    expect(configurationProblem({ kind: 'local', dir: 'invoices' }, noRoot)).toEqual({ field: 'kind', message: 'This app sets no storage root (workflows.storage.root), so it takes only s3 configurations' })
  })

  it('refuses a folder that leaves the root', () => {
    for (const dir of ['../x', '/srv', '.tmp', '', null]) expect(configurationProblem({ kind: 'local', dir }, withRoot)?.field, String(dir)).toBe('dir')
  })

  it('refuses an endpoint the app does not list, also with a path, and a region or bucket that could steer the host', () => {
    expect(configurationProblem({ ...bucket, endpoint: 'https://127.0.0.1' }, withRoot)?.field).toBe('endpoint')
    expect(configurationProblem({ ...bucket, endpoint: 'https://storage.example.com/x' }, withRoot)?.field).toBe('endpoint')
    expect(configurationProblem({ ...bucket, region: 'x.attacker.example/' }, withRoot)?.field).toBe('region')
    expect(configurationProblem({ ...bucket, bucket: 'evil.example.com/x' }, withRoot)?.field).toBe('bucket')
  })

  it('refuses one key without the other, and fields of the other kind', () => {
    expect(configurationProblem({ ...bucket, access_key_id: encrypted }, withRoot)?.field).toBe('secret_access_key')
    expect(configurationProblem({ kind: 'local', dir: 'a', bucket: 'acme-files' }, withRoot)?.field).toBe('bucket')
    expect(configurationProblem({ ...bucket, dir: 'a' }, withRoot)?.field).toBe('dir')
  })
})
