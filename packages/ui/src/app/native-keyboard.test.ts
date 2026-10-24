import { describe, expect, it, vi } from 'vitest'
import { showKeyboardAccessoryBar } from './native-keyboard'

const bridgeOf = (platform: string, plugins: string[]) => {
  const nativePromise = vi.fn(async () => undefined)
  return { bridge: { isNativePlatform: () => true, getPlatform: () => platform, isPluginAvailable: (name: string) => plugins.includes(name), nativePromise }, nativePromise }
}

describe('showKeyboardAccessoryBar', () => {
  it('shows the bar above the keyboard on iOS, which the keyboard plugin hides', async () => {
    const { bridge, nativePromise } = bridgeOf('ios', ['Keyboard'])
    await showKeyboardAccessoryBar(bridge)
    expect(nativePromise).toHaveBeenCalledWith('Keyboard', 'setAccessoryBarVisible', { isVisible: true })
  })

  it.each([
    ['android', ['Keyboard']],
    ['ios', []],
  ])('leaves %s with plugins %j as it is', async (platform, plugins) => {
    const { bridge, nativePromise } = bridgeOf(platform, plugins)
    await showKeyboardAccessoryBar(bridge)
    expect(nativePromise).not.toHaveBeenCalled()
  })
})
