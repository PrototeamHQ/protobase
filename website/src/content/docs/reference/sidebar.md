---
title: Sidebar
description: How sidebar entries are grouped, how an entry lists recent records, with status dots or without, and how it links to its create form.
---

The admin's sidebar has one entry per resource view, grouped by `nav.group` (default: the database schema, with no group name for `public`) and sorted by `nav.order`, then by the order `config/index.ts` exports them, in `protobase dev` and in a built bundle alike. The app opens on the first entry. A view's [named lists](/reference/ui-config/#more-than-one-list) are entries of their own, placed by their own `nav`. `nav({ hidden: true })` leaves a resource out, for line and link tables; a resource in the [user menu](/reference/user-menu/) is left out too. [Composed pages](/reference/layouts/#setup) have entries of their own, and groups that hold pages come first. A [remote resource](/reference/remote-resources/) has its entry where its source's view places it; while its source cannot be reached, it sits under the source's label, marked "Cannot reach" with the source's name.

## The current organization

For a resource whose lists read [across organizations](/reference/access/#lists-across-organizations), `nav({ tenant: 'current' })` opens its entry on the organization the session works in, while the person can still clear or widen it:

```ts
view<typeof apps>('apps')
  .nav({ group: 'Platform', tenant: 'current' })
  .list((r) => ({ columns: [r.name, r.organization_id, r.status], filter: 'isNull(parent_id)' }))
  .filters((r, w) => [w.facets(r.organization_id)])
```

`/meta` writes the session's organization into the list's opening filter, here `isNull(parent_id) AND organization_id = "<id>"`, and into the filter of its [recent records](#recent-records). Like any opening filter it applies when the address names no filter: the facet shows the organization chosen, and the person picks others or clears it, which lists every organization they are a member of. A link with its own filter replaces it, and switching organization opens the app again on the new one. A [named list](/reference/ui-config/#more-than-one-list) takes `tenant` in its own `nav`. `createAdmin` refuses to start when the view has no `.list(...)`, or the resource has no `.tenant()` on a `.filterable()` field.

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
| `tones` | Dot colour per status value: `neutral`, `info`, `success`, `warning` or `danger`. Values not listed are `neutral`. Optional. |
| `pulse` | Status values whose dot pulses, for states in progress (a deploy running, an order being picked). Needs `status`. |
| `filter` | Which records qualify, as AIP-160 text, exactly as `?filter=` on the list API. Use it to leave out finished or inactive records, or to keep them while they are recent: `status != "stopped" OR updated_at > now() - 7d`. |
| `orderBy` | AIP-132 order, as `?order_by=`; the list's `sort` when omitted. |
| `limit` | How many records, 1 to 20; 3 when omitted. |
| `marks` | The name of a hook in the UI config's `marks` that marks each record for the person reading, such as an unread conversation in bold with a count. See [Marks per reader](#marks-per-reader). Optional. |

The entry then works like this:

- The label opens the full list, as before; the chevron beside it shows or hides the records. The choice is kept per entry in this browser (`localStorage`), and an entry starts open.
- Each record shows its title (the view's `title`, as in breadcrumbs) and opens its record page. The open record is highlighted.
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

The records keep the group's order. A mark is presentation only: it is no field, filter or sort key, and the server computes nothing for it; what it counts comes from the requests the hook makes as the reader. Icon sidebars show no records, so no marks either. A group whose name no UI config registers, such as a plugin's that is turned off, shows its records unmarked. <gap>A marks hook that throws cannot be confined to its own group because an error boundary around a group's marks is not implemented, so it stops the sidebar as a throwing component would.</gap>

### Checks

`createAdmin` refuses to start when a group does not fit its resource: an unknown `status` field, `pulse` without a `status`, a tone outside the palette, a `limit` outside 1 to 20, `marks` without a name, or a `filter` or `orderBy` the list API would reject (unknown, non-filterable or non-sortable fields, bad syntax). `view.toModel(resourceModel)` runs the same checks.

`/meta` drops the group, and keeps the rest of `nav`, for a caller who cannot read a field it uses (its status when it has one, or a field in its filter or order), so it never names a hidden field.

`EMAIL=... PASSWORD=... bun scripts/e2e-shell.mjs` checks the groups and the user menu in a browser against a running `bun run --cwd tests/apps/erp dev` (`BASE` for another address), comparing them with what the API gives that user.
