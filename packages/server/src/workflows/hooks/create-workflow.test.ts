import { describe, expect, it } from 'vitest'
import type { WebhookTrigger } from '@protobase/workflows/plugin'
import { parseCreateBody } from './create-body'
import { checkGoLive } from './create-workflow'

// app:webhook gives its sender a URL; acme:events registers its own with its service
const webhooks = (type: string) => ({ 'app:webhook': {}, 'acme:events': { subscribe: async () => ({}) } })[type] as WebhookTrigger | undefined

describe('checkGoLive', () => {
  it('issues a URL only for a published webhook trigger whose sender is given one', () => {
    expect(checkGoLive(webhooks, { 'app:webhook': { auth: { mode: 'bearer' } } }, { publish: true })).toEqual({ type: 'app:webhook', input: { auth: { mode: 'bearer' } } })
    expect(checkGoLive(webhooks, { 'app:webhook': {} }, {})).toBeUndefined()
    expect(checkGoLive(webhooks, { 'acme:events': {} }, { publish: true })).toBeUndefined()
    expect(checkGoLive(webhooks, { manual: {} }, { publish: true })).toBeUndefined()
    expect(checkGoLive(webhooks, 'not a trigger', { publish: true })).toBeUndefined()
  })

  it('refuses a secret without a URL to keep it for, or one the trigger\'s auth mode cannot check', () => {
    expect(() => checkGoLive(webhooks, { 'app:webhook': {} }, { secret: `whsec_${Buffer.alloc(32).toString('base64')}` })).toThrow(/goes with publish/)
    expect(() => checkGoLive(webhooks, { 'acme:events': {} }, { publish: true, secret: 'x'.repeat(40) })).toThrow(/goes with publish/)
    expect(() => checkGoLive(webhooks, { 'app:webhook': {} }, { publish: true, secret: 'whsec_c2hvcnQ=' })).toThrow(/whsec_/)
    expect(() => checkGoLive(webhooks, { 'app:webhook': { auth: { mode: 'bearer' } } }, { publish: true, secret: 'short' })).toThrow(/32 to 512/)
    expect(checkGoLive(webhooks, { 'app:webhook': { auth: { mode: 'bearer' } } }, { publish: true, secret: 'x'.repeat(40) })).toMatchObject({ type: 'app:webhook' })
  })
})

describe('parseCreateBody', () => {
  it('takes the workflow\'s fields with publish and webhook_secret beside them', () => {
    expect(parseCreateBody('{"name":"Hook","publish":true,"webhook_secret":"s"}')).toEqual({ fields: { name: 'Hook' }, live: { publish: true, secret: 's' } })
    expect(parseCreateBody('{"name":"Hook"}')).toEqual({ fields: { name: 'Hook' }, live: {} })
    for (const text of ['', '[1]', 'null', '{"publish":"yes"}', '{"webhook_secret":1}']) expect(() => parseCreateBody(text), text).toThrow()
  })
})
