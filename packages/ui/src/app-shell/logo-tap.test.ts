import { describe, expect, it, vi } from 'vitest'
import { logoTapEvent, tellLogoTap } from './logo-tap'

/** A page as the shell sees it: an event target with the page that frames it, itself when none does. */
const pageOf = (parent?: { postMessage: (message: unknown, origin: string) => void }) => {
  const page = new EventTarget() as unknown as { parent: unknown }
  page.parent = parent ?? page
  return page as unknown as Window
}

describe('tellLogoTap', () => {
  it('dispatches a cancelable event, which nobody takes by default', () => {
    const page = pageOf()
    const seen: Event[] = []
    page.addEventListener(logoTapEvent, (event) => seen.push(event))
    expect(tellLogoTap(page)).toBe(false)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.cancelable).toBe(true)
  })

  it('tells when a listener took the tap', () => {
    const page = pageOf()
    page.addEventListener(logoTapEvent, (event) => event.preventDefault())
    expect(tellLogoTap(page)).toBe(true)
  })

  it('posts the tap to the page that frames it, and to no page when none does', () => {
    const parent = { postMessage: vi.fn() }
    tellLogoTap(pageOf(parent))
    expect(parent.postMessage).toHaveBeenCalledWith({ type: logoTapEvent }, '*')
    const top = pageOf()
    const post = vi.fn()
    ;(top as unknown as { postMessage: unknown }).postMessage = post
    tellLogoTap(top)
    expect(post).not.toHaveBeenCalled()
  })
})
