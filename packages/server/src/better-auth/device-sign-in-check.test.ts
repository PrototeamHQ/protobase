import { describe, expect, it } from 'vitest'
import { checkDeviceSignIn } from './device-sign-in-check'

describe('a platform provider that signs in devices', () => {
  const phone = { provider: 'phone', devices: true }
  const github = { provider: 'github', devices: false }

  it('is refused while the device module is off, naming the setting', () => {
    expect(() => checkDeviceSignIn([github, phone], ['auth'])).toThrow('The platform sign-in provider "phone" signs in devices while auth.signInDevices is off: turn on auth.signInDevices')
  })

  it('is let through with the module on, as are providers of no devices', () => {
    expect(() => checkDeviceSignIn([phone], ['auth', 'platform_devices'])).not.toThrow()
    expect(() => checkDeviceSignIn([github], ['auth'])).not.toThrow()
  })
})
