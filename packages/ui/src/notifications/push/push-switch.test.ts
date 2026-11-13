import { afterEach, describe, expect, it, vi } from 'vitest'
import { PushChoiceNotStored, PushRegistrationError } from './push-failure'
import { pushSwitch, type PushSwitchUpdate } from './push-switch'
import type { PushState } from './web-push'

afterEach(() => vi.restoreAllMocks())

// A switch over push answering `turnOn`, `turnOff` and `state` as given, recording every change it tells.
const setup = (push: { turnOn?: () => Promise<PushState>; turnOff?: () => Promise<void>; state?: () => Promise<PushState> }) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const changes: PushSwitchUpdate[] = []
  const actions = pushSwitch({ turnOn: async () => 'on', turnOff: async () => {}, state: async () => 'off', ...push }, (change) => void changes.push(change))
  return { ...actions, changes }
}

describe('pushSwitch', () => {
  it('is busy while turning push on, then tells the new state', async () => {
    const { turnOn, changes } = setup({})
    await turnOn()
    expect(changes).toEqual([{ failure: undefined, busy: true }, { state: 'on' }, { busy: false }])
  })

  it('tells why turning push on failed, logs it, and stops being busy', async () => {
    const refusal = new PushRegistrationError('no valid aps-environment entitlement string found for application')
    const { turnOn, changes } = setup({ turnOn: () => Promise.reject(refusal) })
    await turnOn()
    expect(changes.slice(1)).toEqual([{ failure: { kind: 'registration', reason: refusal.reason } }, { busy: false }])
    expect(console.error).toHaveBeenCalledWith('Notifications could not be turned on:', refusal)
  })

  it('reads push again after turning it off, telling a turn-off the device could not store', async () => {
    const { turnOff, changes } = setup({ turnOff: () => Promise.reject(new PushChoiceNotStored()) })
    await turnOff()
    expect(changes.slice(1)).toEqual([{ failure: { kind: 'off-not-stored' } }, { state: 'off' }, { busy: false }])
  })

  it('stops being busy after turning push off even when push cannot be read again', async () => {
    const lost = new Error('The plugin is gone')
    const { turnOff, changes } = setup({ state: () => Promise.reject(lost) })
    await expect(turnOff()).resolves.toBeUndefined()
    expect(changes).toEqual([{ failure: undefined, busy: true }, { busy: false }])
    expect(console.error).toHaveBeenCalledWith('Whether notifications are on could not be read:', lost)
  })
})
