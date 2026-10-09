---
title: Layouts
description: Composed pages from JSX layouts, the element tree they compile to, what they may hold, and how data, conditions, actions and access work in them.
---

A composed page is a layout file in the config, written in JSX and compiled to plain data. The server checks it against the resources, serves it to each user in `/api/meta` without what they may not see, and the admin renders it from blocks that read the regular API. [Your first composed page](/guides/first-composed-page/) builds one step by step; this page is the reference.

## Setup

A layout file is `.tsx` and starts with the JSX import source:

```tsx
/** @jsxImportSource @protobase/layout */
import { Page, Stat, page } from '@protobase/layout'

export const overview = page('overview', <Page title="Overview"><Stat label="Orders" resource="orders" /></Page>, { nav: { group: 'Sales', order: 0 } })
```

The comment makes `@protobase/layout/jsx-runtime` compile the file instead of React's runtime, and it is how the build recognises a layout file, so every layout file needs it. Export the page from the config module like a resource or view, for example `export { overview } from './overview/page'` in `config/index.ts`; `configExports` tells pages from views.

`page(name, tree, options?)`:

| | |
| --- | --- |
| `name` | The address: the page is at `/<name>`, beside the resources, so a resource may not have the same name. Lowercase first letter, then letters, digits and dashes. |
| `tree` | One `<Page>` element. |
| `options.nav` | `{ group, order, hidden }`, as for views. A page without a group is in "Pages"; groups that hold pages come first in the sidebar. |
| `options.icon` | One of the [user menu icons](/reference/user-menu/), or `layout-dashboard` (the default). |
| `options.roles` | Only users with one of these roles get the page. Without it, everyone who can sign in does. |

A page can also sit in the [user menu](/reference/user-menu/) with `m.page(name)`; it then leaves the sidebar. The first page is where the admin opens.

## The element tree

Every element compiles to `{ type, props, children }`, and a custom component also carries `custom: true`:

```json
{
  "type": "Page",
  "props": { "title": "Overview" },
  "children": [{ "type": "Stat", "props": { "label": "Orders", "resource": "orders" }, "children": [] }]
}
```

Children are elements and text. `null`, `undefined` and booleans render nothing and numbers become text, as in React, so `{isBeta && <Card />}` and `.map()` over a constant list work. Fragments are flattened. An element may be a prop value too: `actions={<Action name="cancel" />}` or a list of them.

## What a layout may hold

A prop is a string, a finite number, a boolean, `null`, or an array or plain object of those (elements included). It is JSON in the end, so the rules are checked twice:

- **At build time.** `protobase build` and `protobase dev` read every file with the `@jsxImportSource @protobase/layout` comment and refuse a function, class or `new` value in a prop or child, and any call to a hook (`useState`, ...), with the file, line and column. No project code runs for this.
- **When the config loads.** The JSX runtime refuses anything else that is not plain data (a function in a variable, a `Date`, a `Map`, `NaN`), `page()` checks every element's props against its block (unknown, missing and mistyped props, children where none are allowed, elements that need a record outside one), and `createAdmin` checks every resource, field, filter, sort, action and condition against the models. Each problem names its place, such as `Page "overview": <Page> › <Table resource="invoices">: unknown column "amount" on invoices`.

Behaviour comes from [named actions](#named-actions); React code from [custom components](/reference/custom-components/).

## Data

`Stat`, `RecordCard`, `Table` and `CardRow` read records of a `resource`. `filter` is AIP-160 and `sort` AIP-132, exactly as the list API's `filter` and `order_by`, so a filter that works in the list's URL works here.

A `RecordCard` (its first match) and each card of a `CardRow` hold a **record**. Inside one, `Field`, `Progress`, `Stat field`, `Show`, `Action` and `ModalForm mode="edit"` work on that record, and a `RecordCard`'s header `actions` do too. A field name may follow relations: `companyId.city` is the city of the record's company, fetched like the record page fetches it and cached.

## Conditions

`<Show when="...">` keeps its children while the condition holds. It is AIP-160 over named values:

| Name | Value |
| --- | --- |
| `status`, `plan.name` | A field of the record around it, through relations. |
| `invoices.count` | How many `invoices` the user can see (an exact count from the list API). |

Comparisons, `AND`, `OR`, `NOT` and parentheses work; functions such as `now()` do not. A field that is missing or that the user cannot read makes the comparison false, and a `Show` that names a resource or field the user cannot see is left out of their page.

## Named actions

`<Action name="..." />` is a button for an action of the resource's view (the record's resource, or `resource="..."` outside a record). The view declares what it does:

| Builder | Does |
| --- | --- |
| `a.update(name, { label, set, confirm?, icon? })` | Updates the record with `set`, with its ETag. |
| `a.remove(name, { label, confirm?, icon? })` | Deletes the record (soft delete when the resource has one). |
| `a.link(name, { label, href, icon? })` | Opens `href`, with `{field}` replaced by the record's value (percent-encoded). A path starting with `/` stays in the app; other links (`https:`, `mailto:`) leave it. |
| `a.action(name, { label, confirm?, icon?, bulk? })` | Runs the handler the app registers under `name` in [`protobase.ui.tsx`](/reference/custom-components/#action-handlers). |

With `confirm` the button asks first. The button is disabled, with the reason as its tooltip, when the user may not update or delete the record, when an `a.action` has no handler, or when an update or delete has no record. After an action, everything shown of that resource reloads. The record page's action rail runs the same actions the same way.

## Access

Every block reads the regular API with the user's token, so the access rules apply to each request exactly as on the list and record pages: row filters such as `.own` narrow every count, table and card, and hidden fields never arrive.

`/api/meta` also gives each user the page without what they cannot use, the way views lose hidden fields:

- a page whose `roles` leave the user out is not sent;
- an element whose resource they cannot see, or whose filter or sort names a field they cannot read, is left out with everything inside it;
- `Field`, `Progress` and `Stat field` on a field they cannot read are left out, and table columns are narrowed;
- `ModalForm` needs create or update permission and keeps only the fields they may write;
- an `Action` missing from their view of the resource is left out, and so is a `Show` that names something they cannot see.

Custom components are kept: they get only their props, and fetch through the same API.
