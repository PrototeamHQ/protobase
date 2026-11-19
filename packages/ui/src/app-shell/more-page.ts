import { useIsDesktop } from '../lib/use-media-query'
import type { BottomBarTab } from './bottom-bar'

/**
 * Whether the shell is in "More page" mode, as a phone app with a tab bar is: the sidebar is a page of its own that
 * "More" opens, the account sits at the top right of the tabs' pages, search is part of the bottom bar, and a page that
 * is no tab leads back to More. `href` is the sidebar's page, `shown` whether the address is it, and `onTab` whether the
 * page shown is one of the bottom bar's tabs.
 */
export type MorePageMode = { on: false } | { on: true; href: string; shown: boolean; onTab: boolean }

export type MorePageInput = {
  desktop: boolean
  /** The bottom bar's tabs; none or an empty list when the app has no bottom bar. */
  tabs: BottomBarTab[] | undefined
  /** The sidebar's own page, and whether the address is it; none where the app gives it no address. */
  menuPage: { href: string; shown: boolean } | undefined
}

/** The one place the mode is decided: on below the desktop width, with a bottom bar and a page for the sidebar. */
export const morePageMode = ({ desktop, tabs, menuPage }: MorePageInput): MorePageMode => {
  if (desktop || !tabs || tabs.length === 0 || !menuPage) return { on: false }
  return { on: true, href: menuPage.href, shown: menuPage.shown, onTab: tabs.some((tab) => tab.active) }
}

/** `morePageMode` for the screen the shell is on. */
export const useMorePageMode = (tabs: BottomBarTab[] | undefined, menuPage: MorePageInput['menuPage']) => morePageMode({ desktop: useIsDesktop(), tabs, menuPage })

/**
 * Whether the account (the person's avatar, or a visitor's way in) is at the top right of the top bar rather than at
 * the bottom of the sidebar: on every phone-width page, so its menu never opens over the sidebar's drawer.
 */
export const accountInTopBar = (desktop: boolean) => !desktop

/**
 * Where search is: in the top bar on a desktop and on a phone without a bottom bar; in More page mode, in the bottom bar
 * where the app put it there (`m.search()`), and otherwise at the top of the More page.
 */
export const searchPlacement = ({ desktop, more, inBottomBar }: { desktop: boolean; more: boolean; inBottomBar: boolean }): 'top-bar' | 'bottom-bar' | 'more-page' =>
  desktop || !more ? 'top-bar' : inBottomBar ? 'bottom-bar' : 'more-page'
