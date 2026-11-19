import { useLayoutEffect } from 'react'

// Under `/-/`, like the account pages: page names start with a letter, and a resource would need a table named `-`.
/** The sidebar as a page of its own, which "More" opens where the native tab bar draws the bottom bar. */
export const menuPagePath = '/-/menu'

/**
 * Where the app goes instead of `path`: for the sidebar's own page, the first tab's address, `firstTab`, or the app's
 * home without one, when the app is `starting` there, as the page is somewhere to go from a tab rather than to start,
 * and whenever More page mode is off (`morePage`), as on a desktop, whose sidebar is beside every page. Nowhere for any
 * other page, which opens as kept.
 */
export const menuPageInstead = (path: string, firstTab: string | undefined, { starting, morePage }: { starting: boolean; morePage: boolean }) =>
  path === menuPagePath && (starting || !morePage) ? (firstTab ?? '/') : undefined

/**
 * While the sidebar's own page shows, the whole document takes the sidebar's colour, so it fills the viewport behind
 * the native tab bar and the areas a pull past either end shows, never the page's background.
 */
export const useMenuPageBackground = (shown: boolean) => {
  useLayoutEffect(() => {
    if (!shown) return
    const root = document.documentElement
    root.style.setProperty('background-color', 'var(--color-sidebar)')
    document.body.style.setProperty('background-color', 'var(--color-sidebar)')
    return () => {
      root.style.removeProperty('background-color')
      document.body.style.removeProperty('background-color')
    }
  }, [shown])
}
