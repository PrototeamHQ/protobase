---
title: Sidebar
description: How sidebar entries are grouped and which icon each shows, how an entry lists recent records, with status dots or without, and how it links to its create form.
---

The admin's sidebar has one entry per resource view, grouped by `nav.group` (default: the database schema, with no group name for `public`) and sorted by `nav.order`, then by the order `config/index.ts` exports them, in `protobase dev` and in a built bundle alike. The app opens on the first entry. A view's [named lists](/reference/ui-config/#more-than-one-list) are entries of their own, placed by their own `nav`. `nav({ hidden: true })` leaves a resource out, for line and link tables; a resource in the [user menu](/reference/user-menu/) is left out too. [Composed pages](/reference/layouts/#setup) have entries of their own, and groups that hold pages come first. A [remote resource](/reference/remote-resources/) has its entry where its source's view places it; while its source cannot be reached, it sits under the source's label, marked "Cannot reach" with the source's name.

Below the `md` breakpoint (768px) the sidebar is a drawer, which the top bar's menu button opens, It is 88% of the screen wide, at most 384px. With a [bottom bar](/reference/bottom-bar/#search-and-more), **More** opens the sidebar as a page of its own instead.

### The top bar on phones

Below the `md` breakpoint every page's top bar looks as a phone app's, with a bottom bar or without one: it takes the app's brand color, the theme's `--primary` with its text in `--primary-foreground`, up behind the status bar, with a round back mark beside the title where the trail has a step back, and the account at the right. Without a bottom bar the menu button for the drawer leads it; with one, the bottom bar's tabs and More navigate instead.

### Menus and drawers on phones

Below the `md` breakpoint every menu, select list and the account menu opens as a sheet from the bottom of the screen, as a menu alone: its drag handle and its own items, as beside its button on a desktop, with no title or close button. Its rows, icons and a switch such as the theme's are sized from its text, at the sidebar drawer's items' size, so they grow with the text size; a menu's heading, such as the account menu's name and email, reads a step larger. It closes by its handle, a swipe down, a tap beside it or Escape, sliding away each time. From `md` up menus open beside their button. Sheets and the sidebar drawer move under the finger as a native drawer does: a drag on them, or on the dim beside them, past a few pixels and close to their axis, moves them one to one, past open with a rubber band; let go, a fast release goes its way and a slow one past half closes them, and they settle without overshoot. Both open at the document's root, with the page's colors, wherever they open from.

### Swipe from the edge

Below the `md` breakpoint a swipe from the screen's left edge does what one rule (`edgeSwipeAction`) says for the page: where the trail has a step back, it goes back to it, a round back mark coming in beside the finger; where there is neither a step back nor a [bottom bar](/reference/bottom-bar/), it opens the sidebar drawer, which follows the finger and settles open or closed as a drag on it does; otherwise, as on a tab's page or with the drawer open, it does nothing, leaving the edge to what is around the page. The page itself never slides.

A host app that uses the edge too, such as one with its own switcher, learns the page's choice ahead of every gesture: where its bridge offers a `ProtobaseEdgeSwipe` plugin, the shell calls its `set({ action })` on every navigation and change, with `back` (the app's own back swipe, asked for only where the history entry behind the page is the trail's step back), `sidebar` or `page` (the page does it), or `none` (the edge is the app's).

## The logo

The sidebar's top shows the app's logo, Protobase's or a plugin's [`shell.logo`](/reference/custom-components/#shell-slots). It has no action of its own. A tap on it dispatches a cancelable `protobase:logo-tap` event on `window` (`logoTapEvent` of `@protobase/ui`), so a plugin, or a host app that embeds the shell, can take the tap: it calls `preventDefault()` and does its own thing, such as opening a switcher. When the page is shown in a frame, the shell also posts `{ type: 'protobase:logo-tap' }` to the page that frames it.

On a phone the sidebar is a drawer over the page. A host or a plugin closes it by dispatching a `protobase:close-sidebar` event on `window` (`closeSidebarEvent` of `@protobase/ui`), such as an app that opens its own switcher on a tap on the logo: `window.dispatchEvent(new Event('protobase:close-sidebar'))`. Where the sidebar sits beside the page, the event does nothing. A tap on the logo alone never closes it.

```ts
window.addEventListener('protobase:logo-tap', (event) => {
  event.preventDefault()
  openSwitcher()
})
```

## Sidebar icons

Each resource shows the icon its view names, in the sidebar, the [bottom bar](/reference/bottom-bar/) and the [user menu](/reference/user-menu/), and its [named lists](/reference/ui-config/#more-than-one-list) show the same icon:

```ts
export const ordersView = view<typeof orders>('orders').names({ singular: 'Order', plural: 'Orders' }).icon('shopping-cart')
```

`icon` is one of `bell`, `book-open`, `bookmark`, `building`, `credit-card`, `external-link`, `file-text`, `globe`, `heart`, `key`, `layout-dashboard`, `life-buoy`, `mail`, `package`, `receipt`, `settings`, `shield`, `shopping-cart`, `tags`, `users` or `warehouse`. A view without one, or with a name not in this list, shows a table icon, whatever the resource is called. A bottom bar tab's or user menu item's own `icon` wins over the view's.

## The current organization

For a resource whose lists read [across organizations](/reference/access/#lists-across-organizations), `nav({ tenant: 'current' })` opens its entry on the organization the session works in, while the person can still clear or widen it:

```ts
view<typeof apps>('apps')
  .nav({ group: 'Platform', tenant: 'current' })
  .list((r) => ({ columns: [r.name, r.organization_id, r.status], filter: 'isNull(parent_id)' }))
  .filters((r, w) => [w.facets(r.organization_id)])
```

`/meta` writes the session's organization into the list's opening filter, here `isNull(parent_id) AND organization_id = "<id>"`, and into the filter of its [recent records](#recent-records). Like any opening filter it applies when the address names no filter: the facet shows the organization chosen, and the person picks others or clears it, which lists every organization they are a member of. A link with its own filter replaces it, and switching organization opens the app again on the new one. A [named list](/reference/ui-config/#more-than-one-list) takes `tenant` in its own `nav`. `createAdmin` refuses to start when the view has no `.list(...)`, or the resource has no `.tenant()` on a `.filterable()` field.

## Entries for creators

`nav({ creatorsOnly: true })` shows the entry only to whoever its list offers **New**, as for the [create link](#create-link), for a list that is there to make records, such as the [tables users add](/reference/user-tables/#in-the-admin-app). Anyone else who may read the resource still opens it at its address.

## Create link

`nav({ create: true })` puts a link to the resource's create form under its entry, reading "New <singular>" after the view's `names`; `create: { label }` gives it its own text. A chat's direct messages, with the conversations under the entry and a link to start one:

```ts
export const directMessagesView = view<typeof directMessages>('direct_messages')
  .names({ singular: 'Message', plural: 'Direct messages' })
  .nav({ recent: { orderBy: 'updated_at desc', limit: 10 }, create: { label: 'New message' } })
```

- It is a link to `/<resource>/new`, so open-in-new-tab and copy-link work; a view with a [create page](/reference/ui-config/#create-pages) opens that page there.
- It shows only where the list offers New: to a caller `/meta` lets create the resource, or, for a view with a create page, a caller who gets that page.
- It stays in view when the entry's recent records are hidden, after them when they show.
- Only text sidebars (`text-large`, `text-small`, and the phone drawer) show it, as with recent records; icon sidebars keep a plain entry.
- A [named list](/reference/ui-config/#more-than-one-list) takes `create` in its own `nav`, reading "New <singular>" after its own `names`.

`createAdmin` refuses an empty `label`.

## Recent records

:::caution[Beta]
A marks hook that throws stops the whole sidebar, not only its own group.
:::

An entry can list a few of its records under it, each with a status dot, so the ones that need attention are one click away:

```ts
// tests/apps/erp/config/orders/ui.ts
export const ordersView = view<typeof orders>('orders')
  .nav({
    recent: {
      status: 'status',
      tones: { draft: 'neutral', confirmed: 'info', picking: 'warning', shipped: 'success' },
      pulse: ['picking'],
      filter: 'status != "delivered" AND status != "cancelled"',
      orderBy: 'created_at desc',
    },
  })
```

Without a `status`, each record is its title alone, with no dot, such as a chat's channels:

```ts
export const channelsView = view<typeof channels>('channels').nav({ recent: { orderBy: 'name asc', limit: 20 } })
```

| Key | Meaning |
| --- | --- |
| `status` | The field whose value picks each record's dot. Typed against the resource's fields. Optional: without it, records have no dot, as a chat's channels. |
| `tones` | Dot per status value, each with a colour and a shape of its own, so a status does not rest on colour alone: `neutral` a gray ring, `info` a diamond in the primary colour, `success` a green dot, `warning` an orange triangle, `danger` a red square. Values not listed are `neutral`. Optional. |
| `pulse` | Status values whose dot pulses, for states in progress (a deploy running, an order being picked). Needs `status`. |
| `filter` | Which records qualify, as AIP-160 text, exactly as `?filter=` on the list API. Use it to leave out finished or inactive records, or to keep them while they are recent: `status != "stopped" OR updated_at > now() - 7d`. |
| `orderBy` | AIP-132 order, as `?order_by=`; the list's `sort` when omitted. |
| `limit` | How many records, 1 to 20; 3 when omitted. |
| `marks` | The name of a hook in the UI config's `marks` that marks each record for the person reading, such as an unread conversation in bold with a count. See [Marks per reader](#marks-per-reader). Optional. |

The entry then works like this:

- The label opens the full list, as before; the chevron beside it shows or hides the records. The choice is kept per entry in this browser (`localStorage`), and an entry starts open.
- Each record shows its title (the view's `title`, as in its record page's heading) and opens its record page. The open record is highlighted.
- "View all" ends the list and opens the full list, like the label.
- Only text sidebars (`text-large`, `text-small`, and the phone drawer) show the records; icon sidebars keep a plain entry.

The records come from the list API with the caller's token, so they follow the same access rules as the list page: row filters such as `.own` apply, and when the list is refused the group says it could not load. Any write to the resource made in the admin refreshes them, and so does returning to the window, unless a record has unsaved changes, so statuses changed elsewhere show up. A record read anew, by its record page or by project code refetching `useRecord`, refreshes its group too when it shows another status or title than the group's row.

### Marks per reader

A record can stand out for the person reading, such as a channel with messages they have not read: in bold, with a count at the end of its row. The group names a hook under `marks` in `protobase.ui.tsx`, and the sidebar calls it with the resource's name while it shows the records. It returns each record's mark by the record's key as its address carries it, or `undefined` while it loads, so it can read the API as the reader with `useList`, `useClient` or live updates, and its marks follow them:

```tsx
// protobase.views.ts
view<typeof channels>('channels').nav({ recent: { orderBy: 'name asc', limit: 20, marks: 'unread' } })

// protobase.ui.tsx
import { defineUi, useList } from '@protobase/ui'

const useUnreadMarks = () => {
  // unread_channels: a resource of the project's own, one row per channel the reader has unread messages in
  const unread = useList('unread_channels', { pageSize: 100 })
  if (unread.isPending) return
  return Object.fromEntries(unread.items.map((row) => [String(row.channel_id), { strong: true, count: Number(row.mentions), label: `${row.mentions} mentions` }]))
}

export default defineUi({ marks: { unread: useUnreadMarks } })
```

| Mark | Meaning |
| --- | --- |
| `strong` | The record's title shows bold and in the foreground colour, not muted. |
| `count` | A small badge at the end of the row, the pill of the notification bell's count; `99+` above 99, none at 0. |
| `label` | Added to the record's name for screen readers and its tooltip, such as "3 mentions". |
| `person` | The user id of the one person the record stands for, such as the other person in a direct message. The row shows their online or away dot, from the app's [presence](/reference/status/#in-the-app), and their busy or do-not-disturb mark beside its title, and adds them and their status text to its name and tooltip. |

A direct message's mark names the other person:

```tsx
const useConversationMarks = () => {
  // conversation_partners: a resource of the project's own, the other person in each of the reader's direct messages
  const partners = useList('conversation_partners', { pageSize: 100 })
  if (partners.isPending) return
  return Object.fromEntries(partners.items.map((row) => [String(row.conversation_id), { person: String(row.user_id) }]))
}
```

A row shows one person's presence; a row for a group names no one and shows none. The records keep the group's order. A mark is presentation only: it is no field, filter or sort key, and the server computes nothing for it; what it counts comes from the requests the hook makes as the reader. Icon sidebars show no records, so no marks either. A group whose name no UI config registers, such as a plugin's that is turned off, shows its records unmarked. <gap>A marks hook that throws cannot be confined to its own group because an error boundary around a group's marks is not implemented, so it stops the sidebar as a throwing component would.</gap>

### Checks

`createAdmin` refuses to start when a group does not fit its resource: an unknown `status` field, `pulse` without a `status`, a tone outside the palette, a `limit` outside 1 to 20, `marks` without a name, or a `filter` or `orderBy` the list API would reject (unknown, non-filterable or non-sortable fields, bad syntax). `view.toModel(resourceModel)` runs the same checks.

`/meta` drops the group, and keeps the rest of `nav`, for a caller who cannot read a field in its filter or order, and lists the records without dots for one who cannot read its status field, so it never names a hidden field.

`EMAIL=... PASSWORD=... bun scripts/e2e-shell.mjs` checks the groups and the user menu in a browser against a running `bun run --cwd tests/apps/erp dev` (`BASE` for another address), comparing them with what the API gives that user.
