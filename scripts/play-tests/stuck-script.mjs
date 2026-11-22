import { withDeadline } from './deadline.mjs'

// A page that stops answering leaves no trace in what its Playwright calls report. The debugger pauses a script that
// never yields, so where it stands names the cause; the agent has to be on before the page hangs, since turning it on
// waits on the page's main thread, while a pause interrupts the script.

/**
 * Turns on the debugger of `page` in `context` and gives a function that says where the page's script stands: the stack
 * it pauses at, or that it did not pause within `ms`, as a renderer stuck outside its script does. Until that function
 * asks, a pause in the page's own code, such as a `debugger` statement, goes on at once.
 */
export const watchScript = async (context, page) => {
  const cdp = await context.newCDPSession(page)
  let asked = false
  let reportPause = () => {}
  cdp.on('Debugger.paused', (event) => {
    if (asked) return reportPause(event)
    // The page closing in the moment between such a pause and its resume rejects, and stops the run as any error does.
    cdp.send('Debugger.resume')
  })
  await cdp.send('Debugger.enable')
  return async (ms) => {
    asked = true
    const paused = new Promise((resolve) => {
      reportPause = resolve
    })
    const event = await withDeadline(Promise.all([paused, cdp.send('Debugger.pause')]).then(([pause]) => pause), ms, undefined)
    if (!event) return `its script did not pause within ${ms / 1000} s`
    return `its script was running:${describeStack(event.callFrames)}`
  }
}

/** The innermost frames of a paused stack, one line each, innermost first. */
export const describeStack = (callFrames) => callFrames.slice(0, 8).map((frame) => `\n    at ${frame.functionName || '(anonymous)'} (${frame.url || 'inline'}:${frame.location.lineNumber + 1}:${frame.location.columnNumber + 1})`).join('')
