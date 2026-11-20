import { describe, expect, it, vi } from 'vitest'
import { signedOutEvent, tellSignedOut } from './signed-out'

describe('tellSignedOut', () => {
  it('dispatches the event on the page and posts it to the page that frames it', () => {
    const posted = vi.fn()
    const dispatched: string[] = []
    const parent = { postMessage: posted } as unknown as Window
    const page = { parent, dispatchEvent: (event: Event) => dispatched.push(event.type) } as unknown as Window
    tellSignedOut(page)
    expect(dispatched).toEqual([signedOutEvent])
    expect(posted).toHaveBeenCalledWith({ type: signedOutEvent }, '*')
  })

  it('posts nothing from a page that is not in a frame', () => {
    const page: { dispatchEvent: () => boolean; parent?: unknown } = { dispatchEvent: () => true }
    page.parent = page
    expect(() => tellSignedOut(page as unknown as Window)).not.toThrow()
  })
})
