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

The comment makes `@protobase/layout/jsx-runtime` compile the file instead of React's runtime, and it is how the build recognises a layout file, so every layout file needs it. Export the page from `config/index.ts` like a resource or view, for example `export { overview } from './overview/page'` in `config/index.ts`; `configExports` tells pages from views.

`page(name, tree, options?)`:

| | |
| --- | --- |
| `name` | The address: the page is at `/<name>`, beside the resources, so a resource may not have the same name. Lowercase first letter, then letters, digits and dashes. |
| `tree` | One `<Page>` element. |
| `options.nav` | `{ group, order, hidden }`, as for views. A page without a group is in "Pages"; groups that hold pages come first in the sidebar. |
| `options.icon` | One of the [user menu icons](/reference/user-menu/), or `layout-dashboard` (the default). |
| `options.roles` | Only users with one of these roles get the page. Without it, everyone who can sign in does. |

A page can also sit in the [user menu](/reference/user-menu/) with `m.page(name)`; it then leaves the sidebar. The admin opens on the first entry of the sidebar as the user sees it, so on the first page there in `nav.order`, not the first page the config exports: `config/index.ts`'s exports are in alphabetical order.

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

A custom component declared with a [fallback](/reference/custom-components/#fallbacks) carries it on each of its elements as `fallback`, elements and text like children, or `[]` to draw nothing:

```json
{ "type": "SeatChart", "props": {}, "children": [], "custom": true, "fallback": [{ "type": "Progress", "props": { "label": "Seats", "value": "seats_used", "max": "plan.seats" }, "children": [] }] }
```

A client that cannot draw the component, such as one without React, draws the fallback instead, and the checks read it like the rest of the tree.

## Text form

Every layout block renders to Markdown text through one shared function, `renderText`, built up from its children. It is the last-resort form of a page, for a client that draws no blocks and for MCP clients and LLMs. Each element's text is made from its children's text, already rendered: a container such as `Grid`, `Box` or `Tabs` reads as its children in order with a blank line between them, and text and links run on in one line as they do on the web.

```tsx
import { Field, Page, renderText } from '@protobase/layout'

renderText(<Page title="Order"><Field name="status" /></Page>, {
  record: { status: 'in_progress' },
  fields: { status: { label: 'Status', valueLabels: { in_progress: 'In progress' } } },
})
// # Order
//
// **Status**: In progress
```

| Option | |
| --- | --- |
| `record` | The record around the tree. `Field`, `Stat field`, `Progress`, `Show` conditions and the `{{field}}`s of addresses read it, through relations as nested objects (`plan.name`); a count a condition names, such as `billing_profiles.count`, is a key of its own. Without it, a field reads as its label alone, a `Show` reads as all it holds, and addresses keep their `{{field}}`s. |
| `fields` | Per field path, its `label` and the `valueLabels` its enum values read as; a field without a label reads under its path. |
| `tables` | Per `Table` element, the records it shows and its columns (`{ columns: [{ name, label, title?, badge?, valueLabels? }], rows }`), which you loaded; the table then reads as its heading and a Markdown table. Without it, a table reads as its heading. |
| `basePath` | What links start with, such as `https://example.com/admin`. |
| `forms` | Text forms by block type, over the built-in ones. |

A heading reads at its level: a `Page` title as `#`, a `Tab` label as `##`, and the title of a `Card` and of a data block as `###`, the data block's linked to its records' list as it filters them. A field's value reads as its enum label, a list as its items, and JSON as a code block. A table's records read as a Markdown table: a header row of labels, a separator row and a row per record, its columns most important first by the same rule a [phone](/reference/blocks/#columns-on-a-phone) uses, each cell on one line with its pipes escaped. `tableMarkdown` gives the same table for records you hold yourself.

A text form of your own is a function from its element and its children's text to Markdown. It can use the default as it is (`childrenText`), wrap a built-in form from `textForms`, or rework the children's text, such as a horizontal line between them:

```ts
import { childrenText, markdown, renderText, textForms, type TextForm } from '@protobase/layout'

const ruled: TextForm = ({ children }) => markdown.blocks(children, '\n\n---\n\n')
const noted: TextForm = (context) => `${textForms.Card!(context)}\n\nUpdated hourly.`

renderText(tree, { forms: { Grid: ruled, Card: noted, SeatChart: childrenText } })
```

A custom component reads as its [fallback](/reference/custom-components/#fallbacks) when it declares one, and otherwise as what it holds, unless `forms` names it.

<gap>A data block's text form cannot read its records itself, such as a table's rows, because reading records for the text form is not implemented.</gap> A `Thread` holding the elements of [`threadItemNodes`](/reference/blocks/#tool-calls) reads as its messages and calls. <gap>A data block other than a `Table` or a `Thread` cannot list records you pass because its text form for records is not implemented.</gap> <gap>A field's text form cannot apply its `format`, such as a relative time, because formatting in the text form is not implemented.</gap> <gap>MCP clients cannot read a page's text form because a tool that serves it is not implemented.</gap>

## What a layout may hold

A prop is a string, a finite number, a boolean, `null`, or an array or plain object of those (elements included). It is JSON in the end, so the rules are checked twice:

- **At build time.** `protobase build` and `protobase dev` read every file with the `@jsxImportSource @protobase/layout` comment and refuse a function, class or `new` value in a prop or child, and any call to a hook (`useState`, ...), with the file, line and column. No project code runs for this.
- **When the config loads.** The JSX runtime refuses anything else that is not plain data (a function in a variable, a `Date`, a `Map`, `NaN`), `page()` checks every element's props against its block (unknown, missing and mistyped props, children where none are allowed, elements that need a record outside one), and `createAdmin` checks every resource, field, filter, sort, action and condition against the models. Each problem names its place, such as `Page "overview": <Page> › <Table resource="invoices">: unknown column "amount" on invoices`.

Behaviour comes from [named actions](#named-actions); React code from [custom components](/reference/custom-components/).

## Data

`Stat`, `RecordCard`, `Table`, `CardRow`, `RecordRow`, `RecordCards` and `Thread` read records of a `resource`. `filter` is AIP-160 and `sort` AIP-132, exactly as the list API's `filter` and `order_by`, so a filter that works in the list's URL works here. `Thread` takes no `sort`: it orders its messages by its `time` field, newest first.

A `RecordCard` (its first match) and each card of a `CardRow` hold a **record**. Inside one, `Field`, `Progress`, `Stat field`, `Show`, `Action` and `ModalForm mode="edit"` work on that record, and a `RecordCard`'s header `actions` do too. A field name may follow relations: `company_id.city` is the city of the record's company, fetched like the record page fetches it and cached.

## Conditions

`<Show when="...">` keeps its children while the condition holds. It is AIP-160 over named values:

| Name | Value |
| --- | --- |
| `status`, `plan.name` | A field of the record around it, through relations. |
| `invoices.count` | How many `invoices` the user can see (an exact count from the list API). |

Comparisons, `AND`, `OR`, `NOT`, parentheses, `isNull(field)` and `in(field, "a", "b")` work. <gap>A condition cannot call other functions, such as `now()`, because their evaluation is not implemented.</gap> A field that is missing or that the user cannot read makes the comparison false, and a `Show` that names a resource or field the user cannot see is left out of their page.

Record pages take the same conditions in the `when` of `l.section`, `l.related` and `l.sidebar`; see [Form and read view](/reference/ui-config/#form-and-read-view).

## Named actions

`<Action name="..." />` is a button for an action of the resource's view (the record's resource, or `resource="..."` outside a record). The view declares what it does:

| Builder | Does |
| --- | --- |
| `a.update(name, { label, set, confirm?, icon?, bulk?, inputs? })` | Updates the record with `set`, with its ETag; not offered on a record that holds those values already, unless it asks for `inputs`, whose answers it writes where `set` says `'{{name}}'`. |
| `a.remove(name, { label, confirm?, icon? })` | Deletes the record (soft delete when the resource has one). |
| `a.link(name, { label, to, icon? })` | Goes `to` an [address](#addresses) in the app, with `{{field}}` in its key, tab, filter, order or create values replaced by the record's value (one in quotes in a filter, `title = "{{title}}"`, with its quotes escaped, so any text stays one value), and its resource too when that is only `{{field}}`: see [links to a resource the record names](#links-to-a-resource-the-record-names). |
| `a.link(name, { label, href, icon? })` | Opens an `href` that leaves the app (`https:`, `mailto:`), with `{{field}}` replaced by the record's value (percent-encoded); an `https:` or `http:` link opens in a new tab without the referrer. An `href` that is only a field, `'{{website}}'`, opens the URL the record holds, as it is: see [links to a record's URL](#links-to-a-records-url). A path in the app is refused when the config loads: give it as `to`. |
| `a.ai(name, { label, prompt, writes, confirm?, icon? })` | Has the model write the field `writes` of the record from `prompt`, `{{field}}` replaced by the record's values, as the user, on the server; see [AI fields and actions](/reference/ai/#ai-actions). |
| `a.action(name, { label, confirm?, icon?, bulk?, inputs? })` | Runs the handler the app registers under `name` in [`protobase.ui.tsx`](/reference/custom-components/#action-handlers), after asking for its [`inputs`](/reference/ui-config/#actions-that-ask-for-input) in a dialog when it has some. |

`icon` is one of `archive`, `arrow-right-left`, `ban`, `bath`, `bed`, `bell`, `bookmark`, `calendar`, `camera`, `copy`, `cpu`, `door-open`, `download`, `external-link`, `file-text`, `hard-drive`, `heart`, `history`, `house`, `key`, `land-plot`, `leaf`, `memory`, `network`, `play`, `plug`, `plus`, `power`, `restart`, `ruler`, `send`, `server`, `stop`, `table`, `tag`, `terminal`, `upload`, `wallet` or `wrench`; another name shows a lightning bolt. With `confirm` the button asks first. Every builder also takes `when`, `otherwise` and `reason`, which limit the action to the records it [applies to](/reference/ui-config/#where-an-action-applies), and `variant: 'danger'`, which draws it in red. The button is disabled, with the reason as its tooltip, when the user may not update or delete the record (or, for an AI action, the field it writes), when an `a.action` has no handler, or when an update, delete or AI action has no record. After an action, everything shown of that resource reloads. The record page's action rail runs the same actions the same way; there an `a.link` is a real link that looks like the rail's buttons, which the browser can preview, copy or open in a new tab, while a disabled one is a disabled button with its reason. <gap>An `<Action>` block for an `a.link` cannot be opened in a new tab or copied as a link because drawing link actions as links is not implemented for the block.</gap>

### Links to a record's URL

A link whose `href` is a single `{{field}}` opens the address that field holds, such as the page a listing came from:

```ts
a.link('source', { label: 'View on {{host}}', icon: 'external-link', href: '{{source_url}}' })
```

The value is used as it is, not percent-encoded, and must be an absolute `https:` or `http:` URL: on a record whose field is empty or holds anything else the button does not show. It opens in a new tab that gets neither the app's window nor its address. `{{host}}` in the label becomes the URL's host without `www.`, so the button above reads "View on example.com". The field must be one of the resource's, and the button shows to whoever the view grants the field, a visitor who is not signed in included; for anyone it hides the field from, the action is left out.

### Links to a resource the record names

A link whose address has only a `{{field}}` as its `resource` goes to the resource that field names, such as a record that describes a table and links to that table's list:

```ts
a.link('open_table', { label: 'Open table', to: { kind: 'list', resource: '{{name}}' } })
```

The button shows only while the app gives the user a resource of that name: on a record whose field is empty, or names a resource the user cannot see or the app does not serve yet, it is left out, and it shows once `/meta` names it. As the resource is known only when the link is followed, such an address takes no filter, order or create values, which the server refuses when it starts; a record's `key` may still be a `{{field}}`.

## Tailwind classes

:::caution[Experimental]
Only the web draws the classes: a client that draws natively draws each element without them. A page built while the app runs, such as a bot's card or an assistant's page, takes no classes yet. This may change in any release.
:::

Some pages are too custom for the blocks, such as a welcome page in the app's own style. For those, every built-in element takes `className`, Tailwind classes as in your components, and the plain elements [`Box`, `Row`, `Column` and `Text`](/reference/blocks/#box-row-column-and-text) build the page from the ground up, with [`Link`](/reference/blocks/#link) and a fixed [`Image`](/reference/blocks/#image) for links and pictures. Blocks stay the better choice where one fits: they bring data, access and every client along.

```tsx
<Page title="Welcome">
  <Column className="gap-6 rounded-2xl bg-primary/10 p-8">
    <Text as="h2" className="text-3xl font-semibold tracking-tight">
      Good to see you, <Text as="span" className="text-primary-text">team</Text>
    </Text>
    <Row className="flex-wrap items-center gap-3">
      <Image src="/logo.svg" alt="" className="size-10" />
      <Text className="text-muted-foreground">Start with the orders that wait for you.</Text>
      <Link to={{ kind: 'list', resource: 'orders' }} variant="primary">Open orders</Link>
    </Row>
  </Column>
  <Table resource="orders" className="shadow-sm" />
</Page>
```

- **Where the CSS comes from.** The classes get CSS where those of your components do: Tailwind scans the project's files, layouts included, in `protobase dev` and in `protobase build`, which gives an app without a `protobase.ui.tsx` a stylesheet of its own when its pages carry classes. Write each class out in full, such as `bg-primary`, never pieced together from parts, since the scan reads the files as text. Theme tokens such as `bg-primary` and `text-muted-foreground` follow the app's [theme](/reference/theme/). <gap>A layout of an `--extend` folder without its own `protobase.ui.tsx` cannot get CSS for its classes in a built app because building a stylesheet for such a folder is not implemented.</gap>
- **On a plain element** the classes are its whole look: a `Row` is only `flex`, a `Column` only `flex flex-col`, and a `Box` and a `Text` nothing. A `Link` or a fixed `Image` with classes drops its own look for them; a `Link` with a `variant` looks like a button of the app, hover and focus included, and its classes add to that.
- **On a block** they go on its outer element, such as a `Card`'s box, and add to its look. An `Action` puts them on its button, and a `Show` on a `div` around its children while it shows them; an [account block](/reference/blocks/#account-blocks), which draws no element of its own, gets a `div` around it that carries them. <gap>A class cannot change what a block's own look already sets, such as its padding, because ordering layout classes after the framework's own is not implemented.</gap>
- **In `/api/meta`** each `className` arrives as written, a prop like any other. A client that cannot use Tailwind classes draws the element without them, so a page reads everywhere when its words are in `Text` and its data in blocks.

## Addresses

Every place in the app has an address, and the app writes and reads them in one way, so no link or component spells out a path:

| Address | Is |
| --- | --- |
| `{ kind: 'list', resource, filter?, orderBy?, display? }` | A resource's list, with the filter, order and [display](/reference/ui-config/#list-displays) the list page would show. |
| `{ kind: 'record', resource, key, edit?, open?, tab?, standard?, version?, run?, panel?, file? }` | One record; `key` is its value, or its parts for a composite key. `edit: true` is its form (`?edit=true`), on a view whose record page opens as a [read view or locked](/reference/ui-config/#read-view-and-edit). `open` lists the titles of the record page's collapsed [groups](/reference/ui-config/#groups) that are open (`?open=<title>`, once per group), and `tab` the title of the [tab](/reference/ui-config/#tabs) it shows (`?tab=<title>`). `standard: true` is its standard page (`?standard=true`), on a view whose record page is a [component of the app's own](/reference/ui-config/#full-area-record-pages) or [opens another](/reference/ui-config/#a-record-page-that-opens-another). On a workflow, `version` is the saved version its graph shows, read-only (`?version=<number>`), and `run` the run shown on it (`?run=<id>`); see [The workflow's page](/reference/workflows/#the-workflows-page). `panel` is the panel a [focus page](/reference/ui-config/#focus-pages) opens with, by a name its surface knows (`?panel=<name>`). `file` names a file field whose file opens in the [viewer](/reference/files/#viewers) for its type (`?file=<field>`). |
| `{ kind: 'create', resource, values? }` | The form for a new record, with `values` filled in by field name, as text: `{ kind: 'create', resource: 'notes', values: { listing_id: '{{id}}' } }` on a listing's page starts a note about that listing. A relation shows the name of the record it points at. The values are a start the person can change, not a rule: what they may write is still up to the access rules. A view with a [create page](/reference/ui-config/#create-pages) shows that page here instead, with the values in the address. |
| `{ kind: 'page', page, tab? }` | A composed page; `tab` the name of one of its [tabs](/reference/blocks/#tabs-and-tab) (`/<page>/<tab>`), the first when omitted. |

The resources, pages and fields an address names are checked when the server starts, like every other name.

## Access

Every block reads the regular API with the user's token, so the access rules apply to each request exactly as on the list and record pages: row filters such as `.own` narrow every count, table and card, and hidden fields never arrive.

`/api/meta` also gives each user the page without what they cannot use, the way views lose hidden fields:

- a page whose `roles` leave the user out is not sent;
- an element whose resource they cannot see, or whose filter or sort names a field they cannot read, is left out with everything inside it, and so is a `Tab` left with nothing in it;
- `Field`, `Progress` and `Stat field` on a field they cannot read are left out, and table columns are narrowed;
- `ModalForm` needs create or update permission and keeps only the fields they may write;
- an `Action` missing from their view of the resource is left out, and so is a `Show` that names something they cannot see.
- an `Image` whose function they may not call is left out; a fixed one (`src`) is kept.

Custom components are kept: they get only their props, and fetch through the same API. A custom component's fallback loses what the user cannot use like the rest of the tree, and a fallback left with nothing is sent as `[]`, so a client still draws nothing in the component's place.
