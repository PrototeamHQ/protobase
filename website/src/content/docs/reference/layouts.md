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

A page can also sit in the [user menu](/reference/user-menu/) with `m.page(name)`; it then leaves the sidebar. The admin opens on the first entry of the sidebar as the user sees it, so on the first page there in `nav.order`, not the first page the config exports: a config module's exports are in alphabetical order.

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

`Stat`, `RecordCard`, `Table`, `CardRow`, `RecordRow` and `RecordCards` read records of a `resource`. `filter` is AIP-160 and `sort` AIP-132, exactly as the list API's `filter` and `order_by`, so a filter that works in the list's URL works here.

A `RecordCard` (its first match) and each card of a `CardRow` hold a **record**. Inside one, `Field`, `Progress`, `Stat field`, `Show`, `Action` and `ModalForm mode="edit"` work on that record, and a `RecordCard`'s header `actions` do too. A field name may follow relations: `company_id.city` is the city of the record's company, fetched like the record page fetches it and cached.

## Conditions

`<Show when="...">` keeps its children while the condition holds. It is AIP-160 over named values:

| Name | Value |
| --- | --- |
| `status`, `plan.name` | A field of the record around it, through relations. |
| `invoices.count` | How many `invoices` the user can see (an exact count from the list API). |

Comparisons, `AND`, `OR`, `NOT` and parentheses work. <gap>A condition cannot call functions such as `now()`, as they are not supported.</gap> A field that is missing or that the user cannot read makes the comparison false, and a `Show` that names a resource or field the user cannot see is left out of their page.

Record pages take the same conditions in the `when` of `l.section`, `l.related` and `l.sidebar`; see [Form and read view](/reference/ui-config/#form-and-read-view).

## Named actions

`<Action name="..." />` is a button for an action of the resource's view (the record's resource, or `resource="..."` outside a record). The view declares what it does:

| Builder | Does |
| --- | --- |
| `a.update(name, { label, set, confirm?, icon?, bulk?, inputs? })` | Updates the record with `set`, with its ETag; not offered on a record that holds those values already, unless it asks for `inputs`, whose answers it writes where `set` says `'{name}'`. |
| `a.remove(name, { label, confirm?, icon? })` | Deletes the record (soft delete when the resource has one). |
| `a.link(name, { label, to, icon? })` | Goes `to` an [address](#addresses) in the app, with `{field}` in its key, filter, order or create values replaced by the record's value. |
| `a.link(name, { label, href, icon? })` | Opens an `href` that leaves the app (`https:`, `mailto:`), with `{field}` replaced by the record's value (percent-encoded); an `https:` or `http:` link opens in a new tab without the referrer. An `href` that is only a field, `'{website}'`, opens the URL the record holds, as it is: see [links to a record's URL](#links-to-a-records-url). A path in the app is refused when the config loads: give it as `to`. |
| `a.ai(name, { label, prompt, writes, confirm?, icon? })` | Has the model write the field `writes` of the record from `prompt`, `{field}` replaced by the record's values, as the user, on the server; see [AI fields and actions](/reference/ai/#ai-actions). |
| `a.action(name, { label, confirm?, icon?, bulk?, inputs? })` | Runs the handler the app registers under `name` in [`protobase.ui.tsx`](/reference/custom-components/#action-handlers), after asking for its [`inputs`](/reference/ui-config/#actions-that-ask-for-input) in a dialog when it has some. |

`icon` is one of `archive`, `arrow-right-left`, `ban`, `bath`, `bed`, `bell`, `bookmark`, `calendar`, `camera`, `copy`, `cpu`, `door-open`, `download`, `external-link`, `file-text`, `hard-drive`, `heart`, `house`, `key`, `land-plot`, `leaf`, `memory`, `network`, `play`, `plug`, `power`, `restart`, `ruler`, `send`, `server`, `stop`, `tag`, `terminal`, `upload`, `wallet` or `wrench`; another name shows a lightning bolt. With `confirm` the button asks first. Every builder also takes `when`, `otherwise` and `reason`, which limit the action to the records it [applies to](/reference/ui-config/#where-an-action-applies), and `variant: 'danger'`, which draws it in red. The button is disabled, with the reason as its tooltip, when the user may not update or delete the record (or, for an AI action, the field it writes), when an `a.action` has no handler, or when an update, delete or AI action has no record. After an action, everything shown of that resource reloads. The record page's action rail runs the same actions the same way.

### Links to a record's URL

A link whose `href` is a single `{field}` opens the address that field holds, such as the page a listing came from:

```ts
a.link('source', { label: 'View on {host}', icon: 'external-link', href: '{source_url}' })
```

The value is used as it is, not percent-encoded, and must be an absolute `https:` or `http:` URL: on a record whose field is empty or holds anything else the button does not show. It opens in a new tab that gets neither the app's window nor its address. `{host}` in the label becomes the URL's host without `www.`, so the button above reads "View on example.com". The field must be one of the resource's, and the button shows to whoever the view grants the field, a visitor who is not signed in included; for anyone it hides the field from, the action is left out.

## Addresses

Every place in the app has an address, and the app writes and reads them in one way, so no link or component spells out a path:

| Address | Is |
| --- | --- |
| `{ kind: 'list', resource, filter?, orderBy?, display? }` | A resource's list, with the filter, order and [display](/reference/ui-config/#list-displays) the list page would show. |
| `{ kind: 'record', resource, key, edit?, open?, tab? }` | One record; `key` is its value, or its parts for a composite key. `edit: true` is its form (`?edit=true`), on a view whose record page opens as a [read view or locked](/reference/ui-config/#read-view-and-edit). `open` lists the titles of the record page's collapsed [groups](/reference/ui-config/#groups) that are open (`?open=<title>`, once per group), and `tab` the title of the [tab](/reference/ui-config/#tabs) it shows (`?tab=<title>`). |
| `{ kind: 'create', resource, values? }` | The form for a new record, with `values` filled in by field name, as text: `{ kind: 'create', resource: 'notes', values: { listing_id: '{id}' } }` on a listing's page starts a note about that listing. A relation shows the name of the record it points at. The values are a start the person can change, not a rule: what they may write is still up to the access rules. A view with a [create page](/reference/ui-config/#create-pages) shows that page here instead, with the values in the address. |
| `{ kind: 'page', page }` | A composed page. |

The resources, pages and fields an address names are checked when the server starts, like every other name.

## Access

Every block reads the regular API with the user's token, so the access rules apply to each request exactly as on the list and record pages: row filters such as `.own` narrow every count, table and card, and hidden fields never arrive.

`/api/meta` also gives each user the page without what they cannot use, the way views lose hidden fields:

- a page whose `roles` leave the user out is not sent;
- an element whose resource they cannot see, or whose filter or sort names a field they cannot read, is left out with everything inside it;
- `Field`, `Progress` and `Stat field` on a field they cannot read are left out, and table columns are narrowed;
- `ModalForm` needs create or update permission and keeps only the fields they may write;
- an `Action` missing from their view of the resource is left out, and so is a `Show` that names something they cannot see.

Custom components are kept: they get only their props, and fetch through the same API.
