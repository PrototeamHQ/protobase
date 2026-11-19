import { describe, expect, it } from 'vitest'
import { uiReadyEvent, tellUiReady } from './ui-ready'

describe("the app's first frame, told to its host", () => {
  it('is dispatched after the next animation frame and a task after it, once the frame is painted', () => {
    const frames: Array<() => void> = []
    const tasks: Array<() => void> = []
    const events: string[] = []
    const page = {
      requestAnimationFrame: (callback: () => void) => frames.push(callback),
      setTimeout: (callback: () => void) => tasks.push(callback),
      dispatchEvent: (event: Event) => events.push(event.type) > 0,
    } as unknown as Pick<Window, 'requestAnimationFrame' | 'setTimeout' | 'dispatchEvent'>
    tellUiReady(page)
    expect(events).toEqual([])
    frames.shift()!()
    expect(events).toEqual([])
    tasks.shift()!()
    expect(events).toEqual([uiReadyEvent])
  })
})
