/**
 * Real touch input for the play functions of "touch" stories, which run in the page and cannot make it themselves. Each
 * goes through the browser's own input pipeline, as a finger would, so the page sees trusted events:
 *
 * - `window.pbTouch(steps)` sends touch events, for drags: a step is `{ type: 'start' | 'move', x, y }` or
 *   `{ type: 'end' }`, with an optional `waitMs` before it; one finger only.
 * - `window.pbPress({ x, y, ms })` starts a tap held for `ms` and returns at once, so the play function can check the
 *   pressed look meanwhile. Only a tap gesture makes the browser apply `:active`; touch events alone do not.
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
  await page.exposeFunction('pbPress', ({ x, y, ms }) => {
    void session.send('Input.synthesizeTapGesture', { x, y, duration: ms, gestureSourceType: 'touch' })
  })
}
