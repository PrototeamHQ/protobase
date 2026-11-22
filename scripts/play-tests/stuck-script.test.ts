import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeStack, watchScript } from './stuck-script.mjs'

const storyScript = { scriptId: '7', url: 'http://files.localhost/assets/story.js' }
const inlineScript = { scriptId: '8', url: '' }
const frame = (functionName: string, scriptId = storyScript.scriptId, lineNumber = 0, columnNumber = 0) => ({ functionName, url: '', location: { scriptId, lineNumber, columnNumber } })

// A CDP session that announces its scripts when the debugger turns on, and whose `Debugger.pause` pauses at `stack`, or
// never pauses without one, as a stuck renderer does. `fail` names commands that reject, as they do once the page closes.
const fakeSession = ({ stack, fail = [] }: { stack?: ReturnType<typeof frame>[]; fail?: string[] } = {}) => {
  const sent: string[] = []
  const page = { closed: false, isClosed: () => page.closed }
  const cdp = Object.assign(new EventEmitter(), {
    send: async (method: string) => {
      sent.push(method)
      if (fail.includes(method)) throw new Error('Target page, context or browser has been closed')
      if (method === 'Debugger.enable') for (const script of [storyScript, inlineScript]) cdp.emit('Debugger.scriptParsed', script)
      if (method === 'Debugger.pause' && stack) queueMicrotask(() => cdp.emit('Debugger.paused', { callFrames: stack }))
      return {}
    },
  })
  return { sent, context: { newCDPSession: async () => cdp }, cdp, page }
}

describe('watchScript', () => {
  afterEach(() => vi.useRealTimers())

  it('turns the debugger on and goes on past a pause the page hits before it asks', async () => {
    const { sent, context, cdp, page } = fakeSession()
    await watchScript(context, page)
    cdp.emit('Debugger.paused', { callFrames: [frame('withDebuggerStatement')] })
    expect(sent).toEqual(['Debugger.enable', 'Debugger.resume'])
  })

  it('says which stack a script that never yields runs, naming each frame by its script', async () => {
    const { sent, context, page } = fakeSession({ stack: [frame('spin', storyScript.scriptId, 11, 4), frame('', inlineScript.scriptId)] })
    const scriptAt = await watchScript(context, page)
    await expect(scriptAt(5000)).resolves.toBe('its script was running:\n    at spin (http://files.localhost/assets/story.js:12:5)\n    at (anonymous) (inline:1:1)')
    expect(sent).toEqual(['Debugger.enable', 'Debugger.pause'])
  })

  it('says when the script does not pause in time, as a renderer stuck outside it does', async () => {
    vi.useFakeTimers()
    const { context, page } = fakeSession()
    const scriptAt = await watchScript(context, page)
    const said = scriptAt(5000)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(said).resolves.toBe('its script did not pause within 5 s')
  })

  it('says when the page closed before its script could pause', async () => {
    const { context, page } = fakeSession({ fail: ['Debugger.pause'] })
    const scriptAt = await watchScript(context, page)
    page.closed = true
    await expect(scriptAt(5000)).resolves.toBe('its page closed before its script could pause')
  })

  it('passes on a failed pause of a page that is still open', async () => {
    const { context, page } = fakeSession({ fail: ['Debugger.pause'] })
    const scriptAt = await watchScript(context, page)
    await expect(scriptAt(5000)).rejects.toThrow('has been closed')
  })

  it('lets a resume go when the page closed before it', async () => {
    const { context, cdp, page } = fakeSession({ fail: ['Debugger.resume', 'Debugger.pause'] })
    const scriptAt = await watchScript(context, page)
    page.closed = true
    cdp.emit('Debugger.paused', { callFrames: [frame('withDebuggerStatement')] })
    await new Promise((resolve) => setTimeout(resolve))
    await expect(scriptAt(5000)).resolves.toBe('its page closed before its script could pause')
  })

  it('names the pause a failed resume left the script in', async () => {
    const { context, cdp, page } = fakeSession({ fail: ['Debugger.resume'] })
    const scriptAt = await watchScript(context, page)
    cdp.emit('Debugger.paused', { callFrames: [frame('withDebuggerStatement', storyScript.scriptId, 2, 0)] })
    await new Promise((resolve) => setTimeout(resolve))
    await expect(scriptAt(5000)).resolves.toBe('its script stayed paused, as resuming it failed:\n    at withDebuggerStatement (http://files.localhost/assets/story.js:3:1)')
  })
})

describe('describeStack', () => {
  it('keeps the eight innermost frames', () => {
    const stack = Array.from({ length: 12 }, (_, index) => frame(`f${index}`))
    expect(describeStack(stack, new Map()).split('\n    at ').slice(1).map((line) => line.split(' ')[0])).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'])
  })
})
