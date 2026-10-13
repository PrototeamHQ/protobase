const frame = () => new Promise((resolve) => setTimeout(resolve, 16))

/**
 * Drags one finger down from the middle of `element` by `distance` pixels, as the touch events a phone sends: a start,
 * a move every frame and an end. Eight frames make a deliberate drag, not a flick.
 */
export const swipeDown = async (element: Element, distance: number) => {
  const box = element.getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  const send = (type: string, offset: number) => {
    const touch = new Touch({ identifier: 1, target: element, clientX: x, clientY: y + offset, pageX: x, pageY: y + offset, screenX: x, screenY: y + offset })
    const touches = type === 'touchend' ? [] : [touch]
    element.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches, targetTouches: touches, changedTouches: [touch] }))
  }
  const steps = 8
  send('touchstart', 0)
  for (let step = 1; step <= steps; step += 1) {
    await frame()
    send('touchmove', (distance * step) / steps)
  }
  await frame()
  send('touchend', distance)
}
