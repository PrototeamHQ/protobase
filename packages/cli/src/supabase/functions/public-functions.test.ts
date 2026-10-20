import { describe, expect, it } from 'vitest'
import { publicFunctions } from './public-functions'

describe('publicFunctions', () => {
  it('names the functions with verify_jwt = false, and no other setting', () => {
    const toml = [
      '[api]',
      'verify_jwt = false',
      '[functions.stripe-webhooks]',
      'verify_jwt = false # Stripe signs its calls',
      '[functions."hello world"]',
      'verify_jwt = false',
      '[functions.hello]',
      'verify_jwt = true',
      'import_map = "./functions/hello/deno.json"',
    ].join('\n')
    expect([...publicFunctions(toml)]).toEqual(['stripe-webhooks', 'hello world'])
  })
})
