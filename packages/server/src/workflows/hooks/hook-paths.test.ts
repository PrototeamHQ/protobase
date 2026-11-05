import { describe, expect, it } from 'vitest'
import { hookPath, redactHookKeys, webhookIssuePath } from './hook-paths'

describe('webhook paths', () => {
  it('builds both addresses and their route patterns', () => {
    expect(webhookIssuePath('/api', 'a1')).toBe('/api/workflows/a1/webhook')
    expect(webhookIssuePath('/api')).toBe('/api/workflows/:workflow/webhook')
    expect(hookPath('/api', 'k')).toBe('/api/workflows/hooks/k')
    expect(hookPath('/api')).toBe('/api/workflows/hooks/:key')
  })

  it('takes the key out of a request log line', () => {
    expect(redactHookKeys('--> POST /api/workflows/hooks/s3cr3tKey_-x?a=1 202 3ms')).toBe('--> POST /api/workflows/hooks/[key]?a=1 202 3ms')
    expect(redactHookKeys('<-- GET /api/v1/workflows')).toBe('<-- GET /api/v1/workflows')
  })
})
