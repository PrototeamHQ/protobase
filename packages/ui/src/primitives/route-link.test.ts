import { createElement, type MouseEvent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { RouteLink, type RouteTarget } from './route-link'

// The anchor's click handler, as the browser would call it
const clickOf = (to: RouteTarget) => (RouteLink({ to }) as ReactElement<{ onClick: (event: MouseEvent) => void }>).props.onClick

const click = (init: Partial<Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>> = {}) => {
  const event = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault: vi.fn(), ...init }
  return event as typeof event & MouseEvent
}

describe('RouteLink', () => {
  it('follows a plain left click in place', () => {
    const onFollow = vi.fn()
    const event = click()
    clickOf({ href: '/orders/1', onFollow })(event)
    expect(onFollow).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }])('leaves a click with %o to the browser', (init) => {
    const onFollow = vi.fn()
    const event = click(init)
    clickOf({ href: '/orders/1', onFollow })(event)
    expect(onFollow).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('leaves every click on a link without onFollow to the browser', () => {
    const event = click()
    clickOf({ href: 'mailto:a@example.test' })(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('opens a link in a new tab without the referrer when asked', () => {
    expect(renderToStaticMarkup(createElement(RouteLink, { to: { href: 'https://shop.example/', newTab: true } }, 'Shop'))).toBe('<a href="https://shop.example/" target="_blank" rel="noreferrer">Shop</a>')
    expect(renderToStaticMarkup(createElement(RouteLink, { to: { href: '/orders' } }, 'Orders'))).toBe('<a href="/orders">Orders</a>')
  })
})
