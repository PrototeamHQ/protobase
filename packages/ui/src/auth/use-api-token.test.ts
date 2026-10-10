import { expect, it } from 'vitest'
import { tokenRefreshDelay } from './use-api-token'

const jwt = (exp: number) => `header.${btoa(JSON.stringify({ exp }))}.signature`

it('reads the token again 30 seconds before it expires, and never sooner than a second', () => {
  const now = 1_000_000_000_000
  expect(tokenRefreshDelay(jwt(now / 1000 + 900), now)).toBe(870_000)
  expect(tokenRefreshDelay(jwt(now / 1000 + 10), now)).toBe(1000)
})
