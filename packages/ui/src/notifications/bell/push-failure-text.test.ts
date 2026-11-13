import { describe, expect, it } from 'vitest'
import { pushFailureText } from './push-failure-text'

describe('the push failure text', () => {
  it('says the reason iOS or Android gave for not registering', () => {
    expect(pushFailureText({ kind: 'registration', reason: 'no valid "aps-environment" entitlement string found for application' })).toBe(
      'Notifications could not be turned on: the device could not register with its push service (no valid "aps-environment" entitlement string found for application).',
    )
  })

  it('names the push service that gave no token, and what to check', () => {
    expect(pushFailureText({ kind: 'no-token', service: 'apns' })).toBe(
      "Notifications could not be turned on: the phone got no answer from Apple's push service. Check that it is online; if it is, this app's build may lack push in its signing.",
    )
    expect(pushFailureText({ kind: 'no-token', service: 'fcm' })).toContain("no answer from Google's push service")
  })

  it('says the server refused the device, and why', () => {
    expect(pushFailureText({ kind: 'refused', reason: 'This device is registered to someone else' })).toBe('Notifications could not be turned on: the server did not accept this device (This device is registered to someone else).')
  })

  it('says any other failure as it came', () => {
    expect(pushFailureText({ kind: 'other', reason: 'The plugin is gone' })).toBe('Notifications could not be turned on: The plugin is gone')
  })
})
