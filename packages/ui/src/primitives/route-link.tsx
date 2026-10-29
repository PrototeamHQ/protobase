import type { AnchorHTMLAttributes } from 'react'
import { inApp } from '../app-shell/breadcrumb'

/**
 * Where a link goes: the `href` the browser shows and opens, and how the app follows it in place. One without
 * `onFollow`, a page outside the app, the browser follows itself, in a new tab without the app's window or address
 * with `newTab`.
 */
export type RouteTarget = { href: string; onFollow?: () => void; newTab?: boolean }

/**
 * An ordinary anchor to `to.href`: a plain click follows it in place with `to.onFollow`, while a middle click or one
 * with Ctrl, Cmd, Shift or Alt opens it in a new tab or window, or saves it, as on any link. Every navigation a click
 * starts is one of these, never a button that moves the page, so the browser shows where it goes and can open it.
 */
export const RouteLink = ({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: RouteTarget }) => {
  const { href, onFollow, newTab } = to
  return (
    <a
      href={href}
      {...(newTab && { target: '_blank', rel: 'noreferrer' })}
      onClick={(event) => {
        onClick?.(event)
        if (!onFollow || event.defaultPrevented || !inApp(event)) return
        event.preventDefault()
        onFollow()
      }}
      {...rest}
    />
  )
}
