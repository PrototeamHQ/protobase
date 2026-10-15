import type { AnchorHTMLAttributes } from 'react'
import { inApp } from '../app-shell/breadcrumb'

/** Where a link in the app goes: the `href` the browser shows and opens, and how the app follows it in place. */
export type RouteTarget = { href: string; onFollow: () => void }

/**
 * An ordinary anchor to `to.href`: a plain click follows it in place with `to.onFollow`, while a middle click or one
 * with Ctrl, Cmd, Shift or Alt opens it in a new tab or window, or saves it, as on any link. Every navigation a click
 * starts is one of these, never a button that moves the page, so the browser shows where it goes and can open it.
 */
export const RouteLink = ({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: RouteTarget }) => (
  <a
    href={to.href}
    onClick={(event) => {
      onClick?.(event)
      if (event.defaultPrevented || !inApp(event)) return
      event.preventDefault()
      to.onFollow()
    }}
    {...rest}
  />
)
