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
  // Paused frames carry no URL of their own, only the id of their script, which the debugger announces as it parses
  // each one, and once for every script already parsed when it turns on. The map lives as long as the page.
  const scriptUrls = new Map()
  cdp.on('Debugger.scriptParsed', ({ scriptId, url }) => scriptUrls.set(scriptId, url))
  let asked = false
  let reportPause = () => {}
  let stuckPause
  cdp.on('Debugger.paused', (event) => {
    if (asked) return reportPause(event)
    cdp.send('Debugger.resume').catch(() => {
      // Closing the page in the moment between the pause and its resume rejects the resume; nothing is left to resume.
      if (page.isClosed()) return
      // Any other failure leaves the script paused, so the story times out and its report names this pause.
      stuckPause = event
    })
  })
  await cdp.send('Debugger.enable')
  const stackOf = (event) => describeStack(event.callFrames, scriptUrls)
  return async (ms) => {
    if (stuckPause) return `its script stayed paused, as resuming it failed:${stackOf(stuckPause)}`
    asked = true
    const paused = new Promise((resolve) => {
      reportPause = resolve
    })
    // The pause can come before the command's answer; a page closed meanwhile rejects the command.
    const pausedOrClosed = cdp.send('Debugger.pause').then(() => paused, (error) => {
      if (page.isClosed()) return 'closed'
      throw error
    })
    const event = await withDeadline(pausedOrClosed, ms, undefined)
    if (event === 'closed') return 'its page closed before its script could pause'
    if (!event) return `its script did not pause within ${ms / 1000} s`
    return `its script was running:${stackOf(event)}`
  }
}

/** The innermost frames of a paused stack, one line each, innermost first, each in the script `scriptUrls` names. */
export const describeStack = (callFrames, scriptUrls) => callFrames.slice(0, 8).map((frame) => `\n    at ${frame.functionName || '(anonymous)'} (${scriptUrls.get(frame.location.scriptId) || 'inline'}:${frame.location.lineNumber + 1}:${frame.location.columnNumber + 1})`).join('')
