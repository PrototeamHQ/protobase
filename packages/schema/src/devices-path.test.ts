import { describe, expect, it } from 'vitest'
import { devicesPath } from './devices-path'

describe('devicesPath', () => {
  it('names the devices, and one of them with its id encoded', () => {
    expect(devicesPath('/api')).toBe('/api/notifications/devices')
    expect(devicesPath('', 'a/b?c')).toBe('/notifications/devices/a%2Fb%3Fc')
  })
})
