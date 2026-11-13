import { describe, expect, it } from 'vitest'
import { ApiError } from '@protobase/client'
import { PushChoiceNotStored, pushFailure, PushRegistrationError, PushTokenTimeout } from './push-failure'

describe('pushFailure', () => {
  it('keeps the reason iOS or Android gave for not registering', () => {
    expect(pushFailure(new PushRegistrationError('no valid "aps-environment" entitlement string found for application'))).toEqual({ kind: 'registration', reason: 'no valid "aps-environment" entitlement string found for application' })
  })

  it('names the push service that gave no token', () => {
    expect(pushFailure(new PushTokenTimeout('apns', 15_000))).toEqual({ kind: 'no-token', service: 'apns' })
  })

  it('takes a server answer as the server refusing the device, with its detail', () => {
    const refusal = new ApiError({ type: 'urn:protobase:problem:other-user', title: 'Conflict', detail: 'This device is registered to someone else', status: 409 })
    expect(pushFailure(refusal)).toEqual({ kind: 'refused', reason: 'This device is registered to someone else' })
  })

  it('tells a turn-off the device could not store', () => {
    expect(pushFailure(new PushChoiceNotStored())).toEqual({ kind: 'off-not-stored' })
  })

  it('keeps the message of any other failure', () => {
    expect([new Error('The plugin is gone'), 'lost'].map(pushFailure)).toEqual([
      { kind: 'other', reason: 'The plugin is gone' },
      { kind: 'other', reason: 'lost' },
    ])
  })
})
