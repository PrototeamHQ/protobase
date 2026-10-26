---
title: User menu
description: The user menu at the bottom of the sidebar, with the app's own account pages and links.
---

The signed-in user sits at the bottom of the sidebar. Clicking them opens a menu with their name and email, which link to their account, the app's own pages, the theme switch, and "Sign out". Account pages (organization, billing, users) and help links belong here rather than among the working resources.

Export one [`userMenu(...)`](/api/schema/functions/usermenu/) from the config module:

```ts
// tests/apps/erp/config/user-menu.ts, re-exported from config/index.ts
import { userMenu } from '@protobase/schema'

export const accountMenu = userMenu((m) => [
  m.resource('organizations', { label: 'Organization', icon: 'building' }),
  m.page('accounts', { label: 'Users', icon: 'users' }),
  m.link('Documentation', 'https://docs.protobase.net', { icon: 'book-open' }),
  m.link('Support', 'mailto:support@example.com', { icon: 'life-buoy' }),
])
```

| Item | Does |
| --- | --- |
| `m.resource(name, { label?, icon? })` | Opens the resource's list. The resource leaves the sidebar. The label defaults to the view's plural name. |
| `m.page(name, { label?, icon? })` | Opens a [composed page](/reference/layouts/). The page leaves the sidebar. The label defaults to its title. |
| `m.link(label, href, { icon? })` | Opens `href` in a new tab. Only `https://`, `http://` and `mailto:` are accepted. |

`accounts` is the built-in [Users page](/reference/auth/#users-page), which the config exports as `usersPage` from `@protobase/layout`; without the export, `createAdmin` refuses the item. Items keep their order. A line splits the menu into groups: these items, then the [organization](/reference/auth/#organizations) pages when the app has organizations, then the person's own: "Account" for everyone (their [account page](/reference/auth/#account-page): profile, [passkeys](/reference/auth/#passkeys) and [two-factor authentication](/reference/auth/#two-factor-authentication)) and "Sign-in policy" for admins (the [sign-in policy](/reference/auth/#sign-in-policy), and the log of [staff sign-ins](/reference/auth/#staff-sign-in)); then the [theme switch](/reference/theme/#light-dark-or-the-system), and "Sign out" always comes last. `icon` is one of `bell`, `book-open`, `bookmark`, `building`, `credit-card`, `external-link`, `file-text`, `heart`, `key`, `layout-dashboard`, `life-buoy`, `mail`, `receipt`, `settings`, `shield`, `users`. A resource item without one uses the resource's sidebar icon, and a link item uses `external-link`.

Every caller gets the menu through `/meta`, without the resources and pages they cannot see, so a user who cannot read `organizations` has no "Organization" item. Links are shown to everyone. `createAdmin` refuses to start when an item names a resource or page that does not exist, and `configExports` refuses a config module that exports two menus.

`protobase dev`, `protobase build` and `protobase serve` pick the menu up from the config module. With `createAdmin` directly, pass it as `userMenu`:

```ts
const { resources, views, userMenu } = configExports(config)
const admin = createAdmin({ resources, views, userMenu, db, authenticate })
```
