import { describe, expect, it } from 'vitest'
import { mergeConfig } from '../../project-config'
import { configExports } from '../../resource-source'
import { webhooks } from './plugin'

describe('webhooks()', () => {
  it('adds the subscriptions and deliveries pages, and the delivery log when asked', () => {
    const plain = configExports(webhooks().config!)
    expect(plain.resources.map((source) => source.toModel().table)).toEqual([
      { schema: 'webhooks', name: 'subscriptions' },
      { schema: 'webhooks', name: 'deliveries' },
    ])
    expect(plain.views.map((view) => view.toModel().resource)).toEqual(['webhook_subscriptions', 'webhook_deliveries'])
    const logged = configExports(webhooks({ schema: 'hooks', deliveryLog: true }).config!)
    expect(logged.resources.map((source) => source.toModel().name)).toEqual(['webhook_subscriptions', 'webhook_deliveries', 'webhook_delivery_log'])
    expect(logged.resources[0]!.toModel().table.schema).toBe('hooks')
  })

  it('keeps its options when an app extends it, and refuses a schema name that is not plain', () => {
    const merged = mergeConfig({ name: 'app', extends: [webhooks({ deliveryLog: true })], config: {} })
    expect(merged.webhooks).toEqual({ deliveryLog: true })
    expect(Object.keys(merged.config!)).toContain('protobase-webhooks:webhookSubscriptions')
    expect(() => webhooks({ schema: 'Web Hooks' })).toThrow('Invalid webhooks schema "Web Hooks"')
  })

  it('keeps the secret sensitive, and tenant and owner set by the server', () => {
    const model = configExports(webhooks().config!).resources[0]!.toModel()
    expect([model.fields.secret!.sensitive, model.tenant, model.owner, model.fields.tenant_id!.readOnly, model.fields.owner_id!.readOnly]).toEqual([true, 'tenant_id', 'owner_id', true, true])
  })
})
