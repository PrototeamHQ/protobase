import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeStack, watchScript } from './stuck-script.mjs'

const frame = (functionName: string, url = 'http://files.localhost/assets/story.js', lineNumber = 0, columnNumber = 0) => ({ functionName, url, location: { lineNumber, columnNumber } })

// A CDP session whose `Debugger.pause` pauses at `stack`, or never pauses without one, as a stuck renderer does.
const fakeSession = (stack?: ReturnType<typeof frame>[]) => {
  const sent: string[] = []
  const cdp = Object.assign(new EventEmitter(), {
    send: async (method: string) => {
      sent.push(method)
      if (method === 'Debugger.pause' && stack) queueMicrotask(() => cdp.emit('Debugger.paused', { callFrames: stack }))
      return {}
    },
  })
  return { sent, context: { newCDPSession: async () => cdp }, cdp }
}

describe('watchScript', () => {
  afterEach(() => vi.useRealTimers())

  it('turns the debugger on and goes on past a pause the page hits before it asks', async () => {
    const { sent, context, cdp } = fakeSession()
    await watchScript(context, {})
    cdp.emit('Debugger.paused', { callFrames: [frame('withDebuggerStatement')] })
    expect(sent).toEqual(['Debugger.enable', 'Debugger.resume'])
  })

  it('says which stack a script that never yields runs', async () => {
    const { sent, context } = fakeSession([frame('spin', undefined, 11, 4), frame('', '')])
    const scriptAt = await watchScript(context, {})
    await expect(scriptAt(5000)).resolves.toBe('its script was running:\n    at spin (http://files.localhost/assets/story.js:12:5)\n    at (anonymous) (inline:1:1)')
    expect(sent).toEqual(['Debugger.enable', 'Debugger.pause'])
  })

  it('says when the script does not pause in time, as a renderer stuck outside it does', async () => {
    vi.useFakeTimers()
    const { context } = fakeSession()
    const scriptAt = await watchScript(context, {})
    const said = scriptAt(5000)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(said).resolves.toBe('its script did not pause within 5 s')
  })
})

describe('describeStack', () => {
  it('keeps the eight innermost frames', () => {
    const stack = Array.from({ length: 12 }, (_, index) => frame(`f${index}`))
    expect(describeStack(stack).split('\n    at ').slice(1).map((line) => line.split(' ')[0])).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'])
  })
})
