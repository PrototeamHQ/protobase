import { f, resource } from '@protobase/schema'
import { definePlugin } from '@protobase/workflows/plugin'
import { describe, expect, it } from 'vitest'
import { workflowTypes } from './workflow-types'

const acme = definePlugin({
  name: 'acme',
  label: 'Acme',
  triggers: {
    watch: { kind: 'polling', label: 'Watch', description: 'Polls for new items.', input: { type: 'object' }, every: '1 minute', start: async () => null, poll: async () => ({ items: [], cursor: null }) },
    signed_in: { kind: 'polling', label: 'Signed in', description: 'Polls as the user.', connection: 'acme', input: { type: 'object' }, every: '1 minute', start: async () => null, poll: async () => ({ items: [], cursor: null }) },
  },
  connections: { acme: { label: 'Acme', signIn: 'acme' } },
  steps: {
    send: { label: 'Send', description: 'Sends.', input: { type: 'object' }, output: { type: 'object' }, run: async () => ({}) },
  },
})

describe('workflowTypes', () => {
  it('saves the available steps and triggers only: a trigger that signs in is refused while the app cannot make its connection', () => {
    const { check, types } = workflowTypes([{ plugin: acme, source: 'acme' }])
    expect(check.resources).toContain('acme:send')
    expect(Object.keys(check.triggers)).toEqual(['app:record', 'app:schedule', 'app:webhook', 'acme:watch'])
    expect(types.find((type) => type.id === 'acme:signed_in')).toMatchObject({ available: false, reason: 'It signs in through a connection, and this app has no sign-in to connect an account with' })
  })

  it('makes a trigger that signs in available once the app has its sign-in provider, naming its connection for the check', () => {
    const { check, types } = workflowTypes([{ plugin: acme, source: 'acme' }], undefined, { encrypted: true, signInProviders: ['acme'], clients: [] })
    expect(types.find((type) => type.id === 'acme:signed_in')).toMatchObject({ available: true })
    expect(Object.keys(check.triggers)).toContain('acme:signed_in')
    expect(check.connections).toEqual({ 'acme:signed_in': 'acme:acme', 'gmail:new_mail': 'gmail:google' })
  })

  it('takes the reviewed webhook auth modes and limits only', () => {
    const check = workflowTypes().check.triggers['app:webhook']!
    expect(check({})).toEqual([])
    expect(check({ auth: { mode: 'hmac', header: 'x-hub-signature-256', prefix: 'sha256=' }, body_limit: 10 * 1024 * 1024, per_minute: 120 })).toEqual([])
    expect(check({ auth: { mode: 'url_only' } })).not.toEqual([])
    expect(check({ body_limit: 10 * 1024 * 1024 + 1 })).not.toEqual([])
    expect(check({ auth: { mode: 'hmac' } })).toEqual([{ field: 'auth.header', message: 'is missing: hmac reads its signature from this header' }])
  })

  it('takes a record trigger on any resource and field name, such as purchase-orders and due-at', () => {
    const orders = resource('purchase-orders').table('purchase_orders').fields({ id: f.integer(), 'due-at': f.timestamp() }).primaryKey((r) => r.id).events((e) => e.crud()).toModel()
    const { check } = workflowTypes([], (name) => (name === 'purchase-orders' ? orders : undefined))
    expect(check.triggers['app:record']!({ resource: 'purchase-orders', key: ['due-at'] })).toEqual([])
  })
})
