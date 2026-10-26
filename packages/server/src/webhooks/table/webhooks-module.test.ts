import { describe, expect, it } from 'vitest'
import { configExports } from '../../resource-source'
import { webhooksModule } from './webhooks-module'

describe('webhooksModule', () => {
  it('adds the subscriptions and deliveries pages, and the delivery log when asked', () => {
    const plain = configExports(webhooksModule())
    expect(plain.resources.map((source) => source.toModel().table)).toEqual([
      { schema: 'webhooks', name: 'subscriptions' },
      { schema: 'webhooks', name: 'deliveries' },
    ])
    expect(plain.views.map((view) => view.toModel().resource)).toEqual(['webhook_subscriptions', 'webhook_deliveries'])
    const logged = configExports(webhooksModule({ schema: 'hooks', deliveryLog: true }))
    expect(logged.resources.map((source) => source.toModel().name)).toEqual(['webhook_subscriptions', 'webhook_deliveries', 'webhook_delivery_log'])
    expect(logged.resources[0]!.toModel().table.schema).toBe('hooks')
  })

  it('refuses a schema name that is not plain', () => {
    expect(() => webhooksModule({ schema: 'Web Hooks' })).toThrow('Invalid webhooks schema "Web Hooks"')
  })

  it('keeps the secret sensitive, and tenant and owner set by the server', () => {
    const model = configExports(webhooksModule()).resources[0]!.toModel()
    expect([model.fields.secret!.sensitive, model.tenant, model.owner, model.fields.tenant_id!.readOnly, model.fields.owner_id!.readOnly]).toEqual([true, 'tenant_id', 'owner_id', true, true])
  })
})
