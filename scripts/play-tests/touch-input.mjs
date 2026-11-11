/**
 * Real touch input for the play functions of "touch" stories, which run in the page and cannot make it themselves. Each
 * goes through the browser's own input pipeline, as a finger would, so the page sees trusted events:
 *
 * - `window.pbTouch(steps)` sends touch events, for drags: a step is `{ type: 'start' | 'move', x, y }` or
 *   `{ type: 'end' }`, with an optional `waitMs` before it; one finger only.
 * - `window.pbPress({ x, y, ms })` starts a tap held for `ms` and returns at once, so the play function can check the
 *   pressed look meanwhile. Only a tap gesture makes the browser apply `:active`; touch events alone do not. The tap goes
 *   through DevTools' touch emulator, whose own gesture recognizer turns it into one on every platform; Chromium on
 *   Linux makes no gestures from `Input.synthesizeTapGesture` or raw touch events, so `:active` never shows there.
 */
export const exposeTouchInput = async (page) => {
  const session = await page.context().newCDPSession(page)
  const types = { start: 'touchStart', move: 'touchMove', end: 'touchEnd' }
  await page.exposeFunction('pbTouch', async (steps) => {
    for (const step of steps) {
      if (step.waitMs) await new Promise((resolve) => setTimeout(resolve, step.waitMs))
      const touchPoints = step.type === 'end' ? [] : [{ x: step.x, y: step.y }]
      await session.send('Input.dispatchTouchEvent', { type: types[step.type], touchPoints })
    }
  })
  await session.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' })
  const finger = (type, at) => session.send('Input.emulateTouchFromMouseEvent', { type, x: Math.round(at.x), y: Math.round(at.y), button: 'left', clickCount: 1, timestamp: Date.now() / 1000 })
  // A story may end while a finger is still down; its page then closes and the lift is dropped.
  const lifts = new Set()
  page.on('close', () => lifts.forEach(clearTimeout))
  await page.exposeFunction('pbPress', async (at) => {
    await finger('mousePressed', at)
    const lift = setTimeout(() => {
      lifts.delete(lift)
      void finger('mouseReleased', at)
    }, at.ms)
    lifts.add(lift)
  })
}
