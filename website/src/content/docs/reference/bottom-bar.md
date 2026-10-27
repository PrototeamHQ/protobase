---
title: Bottom bar
description: Tabs along the bottom of a phone, as on iOS, for the roles that work from one.
---

On phones the sidebar is a drawer behind the top bar's menu button. For people who work from a phone, such as on a warehouse floor, a bottom bar puts their few screens one tap away: up to four tabs, each an icon above its label, the current one highlighted, and "More" last, which opens the drawer with the rest. The bar keeps clear of the iPhone home indicator. From the `md` breakpoint (768px) up there is no bar; the sidebar shows instead.

Export a [`bottomBar(...)`](/api/schema/functions/bottombar/) from `config/index.ts` for each group of roles that gets one:

```ts
// tests/apps/erp/config/bottom-bar.ts, re-exported from config/index.ts
import { bottomBar } from '@protobase/schema'

export const warehouseBar = bottomBar({ label: 'Warehouse', roles: ['warehouse'] }, (m) => [
  m.resource('stock_levels', { label: 'Stock' }),
  m.resource('stock_moves', { label: 'Moves' }),
  m.resource('orders', { label: 'Orders' }),
  m.resource('locations', { label: 'Locations' }),
])
```

| Item | Does |
| --- | --- |
| `m.resource(name, { label, icon? })` | Opens the resource's list. Without `icon`, the resource's sidebar icon. |
| `m.page(name, { label, icon? })` | Opens a [composed page](/reference/layouts/). Without `icon`, the page's own. |
| `m.link(label, href, { icon? })` | Opens `href` in a new tab. Only `https://`, `http://` and `mailto:` are accepted. |

Every tab needs its `label`: tabs are narrow, so the bar does not borrow a view's or page's longer name. `icon` takes the names the [user menu](/reference/user-menu/) does. Items keep their order. Unlike the user menu, a bar takes nothing out of the sidebar.

## Which bar someone gets

Each bar names its roles, and a role belongs to one bar. A caller gets the bar that names their active role, through `/meta` as `bottomBar`, without the resources and pages they cannot see, except that a visitor keeps a resource whose view has a [sign-in prompt](/reference/ui-config/#sign-in-prompts), which tells them to sign in; a bar with none left is not sent. Someone whose active role no bar names gets no bar. The active role is the one the session acts with, which the person [switches in the profile menu](/reference/auth/#active-role); with an authenticator other than Better Auth's, the caller's first role.

## Checks

`createAdmin` refuses to start when a bar names a resource or page that does not exist, has no roles, no items or more than four, names a role the app does not have (the roles of [`auth.roles`](/reference/auth/#roles) and [`defineRoles`](/reference/access/); without either, any role is accepted), shares a role with another bar, or has the label of another bar. The checks are [`bottomBarErrors`](/api/schema/functions/bottombarerrors/) from `@protobase/schema`, a pure function of the bars and the app's names.

`protobase dev`, `protobase build` and `protobase serve` pick the bars up from `config/index.ts`. With `createAdmin` directly, pass them as `bottomBars`:

```ts
const { resources, views, bottomBars } = configExports(config)
const admin = createAdmin({ resources, views, bottomBars, db, authenticate })
```
