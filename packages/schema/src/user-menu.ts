import type { UserMenuItemModel, UserMenuModel } from './model'

const items = {
  /** Opens the resource's list. A resource in the user menu is left out of the sidebar. */
  resource: (resource: string, options: { label?: string; icon?: string } = {}): UserMenuItemModel => ({ kind: 'resource', resource, ...options }),
  /** Opens a composed page (`page()` from @protobase/layout). A page in the user menu is left out of the sidebar. */
  page: (page: string, options: { label?: string; icon?: string } = {}): UserMenuItemModel => ({ kind: 'page', page, ...options }),
  /** An address outside the admin, opened in a new tab: `https:`, `http:` or `mailto:`. */
  link: (label: string, href: string, options: { icon?: string } = {}): UserMenuItemModel => {
    if (!/^(https?:\/\/|mailto:)/i.test(href)) throw new Error(`User menu link "${label}": href must start with https://, http:// or mailto:`)
    return { kind: 'link', label, href, ...options }
  },
}

/** What the server needs from a `userMenu(...)` export of the config module. */
export type UserMenuSource = { toUserMenuModel(): UserMenuModel }

/** The pages under the signed-in user, at the bottom of the sidebar, above the built-in "Sign out". */
export const userMenu = (build: (m: typeof items) => UserMenuItemModel[]): UserMenuSource => {
  const model: UserMenuModel = { items: build(items) }
  return { toUserMenuModel: () => structuredClone(model) }
}
