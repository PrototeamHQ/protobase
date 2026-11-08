import { describe, expect, it } from 'vitest'
import { bridgeSocketPath, bridgeTokenParam } from './bridge-address'

describe('bridgeSocketPath', () => {
  it('puts the token in the query of the function’s path, encoded', () => {
    const path = bridgeSocketPath('/api/functions/console', 'a+b/c')
    expect(path).toBe('/api/functions/console?token=a%2Bb%2Fc')
    expect(new URL(path, 'http://app.test').searchParams.get(bridgeTokenParam)).toBe('a+b/c')
  })
})
