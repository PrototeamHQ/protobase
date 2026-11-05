import { f, resource } from '@protobase/schema'
import { definePlugin } from '@protobase/workflows/plugin'
import { describe, expect, it } from 'vitest'
import { workflowTypes } from './workflow-types'

const acme = definePlugin({
  name: 'acme',
  label: 'Acme',
  triggers: {
    watch: { kind: 'polling', label: 'Watch', description: 'Polls for new items.', input: { type: 'object' }, every: '1 minute', start: async () => null, poll: async () => ({ items: [], cursor: null }) },
  },
  connections: {},
  steps: {
    send: { label: 'Send', description: 'Sends.', input: { type: 'object' }, output: { type: 'object' }, run: async () => ({}) },
  },
})

describe('workflowTypes', () => {
  it('saves the available steps and triggers only: a polling trigger is refused beside its plugin\'s step', () => {
    const { check, types } = workflowTypes([{ plugin: acme, source: 'acme' }])
    expect(check.resources).toContain('acme:send')
    expect(Object.keys(check.triggers)).toEqual(['app:record'])
    expect(types.find((type) => type.id === 'acme:watch')).toMatchObject({ available: false, reason: 'This app does not run polling triggers yet' })
  })

  it('takes a record trigger on any resource and field name, such as purchase-orders and due-at', () => {
    const orders = resource('purchase-orders').table('purchase_orders').fields({ id: f.integer(), 'due-at': f.timestamp() }).primaryKey((r) => r.id).events((e) => e.crud()).toModel()
    const { check } = workflowTypes([], (name) => (name === 'purchase-orders' ? orders : undefined))
    expect(check.triggers['app:record']!({ resource: 'purchase-orders', key: ['due-at'] })).toEqual([])
  })
})
