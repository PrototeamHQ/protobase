---
title: Sidebar
description: How sidebar entries are grouped, and how an entry lists recent records with status dots.
---

The admin's sidebar has one entry per resource view, grouped by `nav.group` (default: the database schema) and sorted by `nav.order`. `nav({ hidden: true })` leaves a resource out, for line and link tables; a resource in the [user menu](/reference/user-menu/) is left out too. [Composed pages](/reference/layouts/#setup) have entries of their own, and groups that hold pages come first.

## Recent records

An entry can list a few of its records under it, each with a status dot, so the ones that need attention are one click away:

```ts
// examples/erp/config/orders/ui.ts
export const ordersView = view<typeof orders>('orders')
  .nav({
    recent: {
      status: 'status',
      tones: { draft: 'neutral', confirmed: 'info', picking: 'warning', shipped: 'success' },
      pulse: ['picking'],
      filter: 'status != "delivered" AND status != "cancelled"',
      orderBy: 'createdAt desc',
    },
  })
```

| Key | Meaning |
| --- | --- |
| `status` | The field whose value picks each record's dot. Typed against the resource's fields. |
| `tones` | Dot colour per status value: `neutral`, `info`, `success`, `warning` or `danger`. Values not listed are `neutral`. |
| `pulse` | Status values whose dot pulses, for states in progress (a deploy running, an order being picked). |
| `filter` | Which records qualify, as AIP-160 text, exactly as `?filter=` on the list API. Use it to leave out finished or inactive records, or to keep them while they are recent: `status != "stopped" OR updatedAt > now() - 7d`. |
| `orderBy` | AIP-132 order, as `?order_by=`; the list's `sort` when omitted. |
| `limit` | How many records, 1 to 20; 3 when omitted. |

The entry then works like this:

- The label opens the full list, as before; the chevron beside it shows or hides the records. The choice is kept per entry in this browser (`localStorage`), and an entry starts open.
- Each record shows its title (the view's `title`, as in breadcrumbs) and opens its record page. The open record is highlighted.
- "View all" ends the list and opens the full list, like the label.
- Only text sidebars (`text-large`, `text-small`, and the phone drawer) show the records; icon sidebars keep a plain entry.

The records come from the list API with the caller's token, so they follow the same access rules as the list page: row filters such as `.own` apply, and when the list is refused the group says it could not load. Any write to the resource made in the admin refreshes them, and so does returning to the window after 30 seconds (the app's cache time), so statuses changed elsewhere show up. A record read anew, by its record page or by project code refetching `useRecord`, refreshes its group too when it shows another status or title than the group's row.

### Checks

`createAdmin` refuses to start when a group does not fit its resource: an unknown `status` field, a tone outside the palette, a `limit` outside 1 to 20, or a `filter` or `orderBy` the list API would reject (unknown, non-filterable or non-sortable fields, bad syntax). `view.toModel(resourceModel)` runs the same checks.

`/meta` drops the group, and keeps the rest of `nav`, for a caller who cannot read a field it uses (its status, or a field in its filter or order), so it never names a hidden field.

`EMAIL=... PASSWORD=... node scripts/e2e-shell.mjs` checks the groups and the user menu in a browser against a running `pnpm --filter erp dev` (`BASE` for another address), comparing them with what the API gives that user.
