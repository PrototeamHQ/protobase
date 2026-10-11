import { isMenuHref } from './menu-href'
import type { BottomBarItemModel, BottomBarModel } from './model'

/** The tabs beside the last one, "More", which opens the sidebar: five tabs in all, as on iOS. */
export const maxBottomBarItems = 4

const items = {
  /** Opens the resource's list. */
  resource: (resource: string, options: { label: string; icon?: string }): BottomBarItemModel => ({ kind: 'resource', resource, ...options }),
  /** Opens a composed page (`page()` from @protobase/layout). */
  page: (page: string, options: { label: string; icon?: string }): BottomBarItemModel => ({ kind: 'page', page, ...options }),
  /** An address outside the admin, opened in a new tab: `https:`, `http:` or `mailto:`. */
  link: (label: string, href: string, options: { icon?: string } = {}): BottomBarItemModel => {
    if (!isMenuHref(href)) throw new Error(`Bottom bar link "${label}": href must start with https://, http:// or mailto:`)
    return { kind: 'link', label, href, ...options }
  },
}

/** What the server needs from a `bottomBar(...)` export of the config module. */
export type BottomBarSource = { toBottomBarModel(): BottomBarModel }

/**
 * Tabs at the bottom of the screen on phones, for the users holding one of `roles`. Export one per group of roles; a
 * role belongs to one bottom bar. `label` names the bar where someone with several switches between them.
 */
export const bottomBar = (options: { label: string; roles: string[] }, build: (m: typeof items) => BottomBarItemModel[]): BottomBarSource => {
  const model: BottomBarModel = { label: options.label, roles: [...options.roles], items: build(items) }
  return { toBottomBarModel: () => structuredClone(model) }
}

/** The bottom bar of someone working as `role`: the one that names it, since a role belongs to one bar. */
export const bottomBarFor = (bars: readonly BottomBarModel[], role: string | undefined) => (role === undefined ? undefined : bars.find((bar) => bar.roles.includes(role)))
