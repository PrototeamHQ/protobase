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

renderText(<Page title="Order"><Field source="status" /></Page>, {
  record: { status: 'in_progress' },
  fields: { status: { label: 'Status', valueLabels: { in_progress: 'In progress' } } },
})
// # Order
//
// **Status**: In progress
```

| Option | |
| --- | --- |
| `record` | The record around the tree. `Field`, the [field components](#field-values), `Diff`, `Stat field`, `Progress`, `Show` conditions and the `{{field}}`s of addresses read it, through relations as nested objects (`plan.name`); a count a condition names, such as `billing_profiles.count`, is a key of its own. The `{{path}}`s of props read it too. Without it, a field reads as its label alone, a condition as holding (a `Show` reads as its children, a `Switch` as its first `Match`), a prop's `{{path}}`s as empty, and addresses keep their `{{field}}`s. |
| `fields` | Per field path, its `label` and the `valueLabels` its enum values read as; a field without a label reads under its path. |
| `records` | Per `ReferenceManyField`, `ReferenceArrayField` or `ReferenceField` element and the record around it, the records it holds, which you loaded; its `RecordsIterator` then reads as its children once per record, in that record, and an empty list as its `empty`. Without it, the block reads as a link to its records. An `ArrayField` reads its items from the record around it. For a `RecordCard`, its record, which its children read; for a `CardRow`, its records, its children once per record. For a `Table` with `select`, the row chosen, and for a `Timeline` with `select`, the chosen bar's first record, whose record its children read; without it they read as nothing. It gets the element, the record around it and the element's place in the tree, the pointer the [read plan](#how-a-page-reads-its-data) names its block by. |
| `params` | The [page parameters](#page-parameters) the page's address holds, such as `{ window: '30d' }`, which `@params` and the `SelectInput`s read, each held to its choices. |
| `tables` | Per `Table` or `Timeline` element, its place in the tree, the record around it and the records of the list around it (which a table without `resource` shows), the records it shows and its columns (`{ columns: [{ name, label, title?, badge?, valueLabels? }], rows }`), which you loaded; the table then reads as its heading and a Markdown table. Without it, a table reads as its heading. A `Timeline` reads the same way, a row per segment, its columns its `lane`, `bar`, `color`, `start` and `end` fields. |
| `locale` | The reader's locale, such as `nl-NL`, in which [field components](#field-values) without `locales` format numbers and dates; the runtime's default when omitted. |
| `basePath` | What links start with, such as `https://example.com/admin`. |
| `forms` | Text forms by block type, over the built-in ones. |
| `models`, `labels` | The app's resources by name, and per resource its fields' labels and value labels, which a custom component's text form reads its records with, such as the graph plugin's [`graphText`](/reference/plugins/#graph). |
| `planned` | Per read of the page's plan, by its block's place in the tree with `#<part>` for a block's other reads (`/children/0#edges`), and the record around it, the records it holds; `pageText` gives it, so a custom component's text form reads its own reads' records. |

A heading reads at its level: a `Page` title as `#`, a `Tab` label as `##`, and the title of a `Card` and of a data block as `###`, the data block's linked to its records' list as it filters them. A field's value reads as its enum label, a list as its items, and JSON as a code block. A table's records read as a Markdown table: a header row of labels, a separator row and a row per record, its columns most important first by the same rule a [phone](/reference/blocks/#columns-on-a-phone) uses, each cell on one line with its pipes escaped. `tableMarkdown` gives the same table for records you hold yourself.

A text form of your own is a function from its element and its children's text to Markdown. It can use the default as it is (`childrenText`), wrap a built-in form from `textForms`, or rework the children's text, such as a horizontal line between them:

```ts
import { childrenText, markdown, renderText, textForms, type TextForm } from '@protobase/layout'

const ruled: TextForm = ({ children }) => markdown.blocks(children, '\n\n---\n\n')
const noted: TextForm = (context) => `${textForms.Card!(context)}\n\nUpdated hourly.`

renderText(tree, { forms: { Grid: ruled, Card: noted, SeatChart: childrenText } })
```

A custom component reads as its [fallback](/reference/custom-components/#fallbacks) when it declares one, and otherwise as what it holds, unless `forms` names it.

### A page's text with its records

`pageText` reads a page's records itself: it starts every read of the page's [read plan](#how-a-page-reads-its-data) at once through the `read` you give it, which makes one read as the reader, such as a list or an `:aggregate` of the API, and once they are all back renders the text form with them. A `RecordCard` reads as its record, its header `actions` too, a `CardRow` as its records, a `Table` as a Markdown table of its rows, one without `resource` of the list around it, and a related list as its records, each nested list under its own record. The record you pass as `record` is the page's own, whose key fills `{{@root.…}}`. A read that fails leaves its block as it reads without records, a link to them.

```ts
import { pageText } from '@protobase/layout'

const text = await pageText(page.tree, page.reads, {
  read: async (read) => ({ rows: (await client.list(read.resource, { filter: read.filter, orderBy: read.orderBy, pageSize: read.pageSize, fields: read.fields, limitPer: read.limitPer })).items }),
  labels: { workers: { name: { label: 'Name' } } },
  params: { window: '30d' },
})
```

It takes the options of `renderText` but `records`, `tables` and `planned`, and `labels`: per resource, its fields' labels and value labels, which its tables' headers and cells read. A count's `read` gives `{ rows: [], total }`, and a count per record around it, an `:aggregate`, its groups as rows `{ value, count }`.

<gap>A `Stat` count, a `Chart`, a `RecordCards`, a `RecordRow` or a `Thread` cannot read its records in `pageText` because their text forms for planned records are not implemented.</gap> <gap>A path in the text form cannot read a record further out than the nearest, such as `../id`, because a stack of records in the text form is not implemented.</gap> A `Thread` holding the elements of [`threadItemNodes`](/reference/blocks/#tool-calls) reads as its messages and calls. <gap>A data block other than a `Table`, a `RecordCard`, a `CardRow`, a `Thread` or a list block cannot list records you pass because its text form for records is not implemented.</gap> <gap>A field's text form cannot apply its `format`, such as a relative time, because formatting in the text form is not implemented.</gap> <gap>MCP clients cannot read a page's text form because a tool that serves it is not implemented.</gap>

## What a layout may hold

A prop is a string, a finite number, a boolean, `null`, or an array or plain object of those (elements included). It is JSON in the end, so the rules are checked twice:

- **At build time.** `protobase build` and `protobase dev` read every file with the `@jsxImportSource @protobase/layout` comment and refuse a function, class or `new` value in a prop or child, and any call to a hook (`useState`, ...), with the file, line and column. No project code runs for this.
- **When the config loads.** The JSX runtime refuses anything else that is not plain data (a function in a variable, a `Date`, a `Map`, `NaN`), `page()` checks every element's props against its block (unknown, missing and mistyped props, children where none are allowed, elements that need a record outside one), and `createAdmin` checks every resource, field, filter, sort, action and condition against the models. Each problem names its place, such as `Page "overview": <Page> › <Table resource="invoices">: unknown column "amount" on invoices`.

Behaviour comes from [named actions](#named-actions); React code from [custom components](/reference/custom-components/).

## Data

`Stat`, `RecordCard`, `Table`, `CardRow`, `RecordRow`, `RecordCards` and `Thread` read records of a `resource`. `filter` is AIP-160 and `sort` AIP-132, exactly as the list API's `filter` and `order_by`, so a filter that works in the list's URL works here. `Thread` takes no `sort`: it orders its messages by its `time` field, newest first. `ReferenceManyField`, `ReferenceArrayField` and `ReferenceField` read records of their `reference` that the record around them points to or is pointed at by: see [related records](#related-records).

A `RecordCard` (its first match), a `ReferenceField`, each card of a `CardRow` and each entry of a `RecordsIterator` hold a **record**. Inside one, `Field`, `Diff`, `Progress`, `Stat field`, `Show`, `Action` and `ModalForm mode="edit"` work on that record, and a `RecordCard`'s header `actions` do too. A field name may follow relations: `company_id.city` is the city of the record's company, fetched like the record page fetches it and cached.

## Related records

:::caution[Beta]
A list's next pages, with `pagination="more"`, are a read of the list's own.
:::

A record's related records repeat under it as a list: a `ReferenceManyField` holds the records of another resource that point at it, a `ReferenceArrayField` the records whose keys a JSON field of it lists, and an `ArrayField` the items of a JSON list it holds. A `RecordsIterator` inside one draws its children once for each entry, with nothing around them, and a `Table` without `resource` draws the list as a table. A `ReferenceField` draws the one record a field points at. They take the names, props and defaults of the [react-admin](/features/compatibility/#react-admin) components of the same names.

```tsx
<RecordCard resource="tasks" recordKey="7">
  <ArrayField source="labels">
    <RecordsIterator><Field source="this" label={false} /></RecordsIterator>
  </ArrayField>
  <ReferenceManyField reference="task_claims" target="task_id" sort={{ field: 'claimed_at', order: 'DESC' }}>
    <RecordsIterator>
      <Card title="Claim {{@index}}">
        <ReferenceField source="worker_id" reference="workers" />
        <ReferenceManyField reference="claim_steps" target="claim_id" perPage={10} empty="No steps yet">
          <RecordsIterator><Field source="name" /></RecordsIterator>
        </ReferenceManyField>
      </Card>
    </RecordsIterator>
  </ReferenceManyField>
</RecordCard>
```

Each entry is a record of the stack while its children draw, so `Field`, `Show`, `{{path}}` placeholders and nested lists inside it read it, and `@index`, `@first` and `@last` count its place in the list. A text item of an `ArrayField`, such as a label, is read as `this`; an object item by its keys, which no model describes, so the build does not check them, and it warns when an item's key could shadow a field of a record further out. A list ties itself to the record around it by a field of that record, its `source`; a `ReferenceManyField`'s is `id` of the nearest record by default. A `ReferenceManyField`'s and a `ReferenceArrayField`'s `filter` and `sort` take AIP-160 and AIP-132 text, or the objects react-admin writes: `{ status: 'open' }` is `status = "open"`, its fields ANDed, and `{ field: 'claimed_at', order: 'DESC' }` is `claimed_at desc`. Without `sort`, such a list is in its key's order, descending, as react-admin's is. A `ReferenceManyField`'s `pagination="more"` adds a button that reads the next `perPage` records into the same list. The [blocks reference](/reference/blocks/#related-records) lists every prop.

## How a page reads its data

:::caution[Beta]
On the web, a `RecordRow` of a view with `listOf` or `searchesOf`, or one inside the records of another block, still reads once it draws, as the marked limits below say.
:::

The build compiles each page into a read plan: one ordinary API read per data block, each known before any record is read, so all of them start together when the page opens and none waits for another's rows. There is no combined page query: each read is a request of its own. `/api/meta` sends each user the plan of the page as they see it, so it holds no read of a resource they cannot read and no field they cannot read.

- **One read per block.** `Stat`, `RecordCard`, `Table`, `CardRow`, `RecordRow`, `RecordCards`, `Thread`, `Chart`, `Timeline`, `ReferenceManyField`, `ReferenceArrayField` and `ReferenceField` each make one list, count or `:aggregate` read. A `Thread`'s tool calls, the row a `Table`'s or the bar a `Timeline`'s `select` chose, each `<resource>.count` a condition names and the total per record of a `Table` or `RecordCards` inside the records of another (`#total`) are reads of their own. A block under `Show` or `Match` is read anyway: the condition decides only what is drawn.
- **Fields are derived.** You never write `fields`. Each read asks for its key and every field drawn in its scope: by `Field`s, [field components](#field-values), `{{path}}`s, conditions and table columns, and the fields a nested list ties itself by. A block whose view decides what it draws, such as a `Table` without `columns` or a `RecordRow`, reads every field. So does a read whose records an `Action` or an edit form changes, since it asks for each record's ETag and an ETag covers the whole record. The other reads ask for no ETag (`etag=false`), so the database reads only their fields.
- **A nested read carries the read around it.** A block inside the records of another ties itself to them by a field: a `ReferenceManyField`'s `target`, a `ReferenceField`'s or `ReferenceArrayField`'s `source`, or `task_id = {{id}}` as a top-level `AND` term of a filter. Its read takes that as a [`related()`](/reference/api/#filtering-through-related-records) term holding the outer read's own filter, order and page size, such as `related(task_id, tasks.id, (status = "open"), "id desc", 10)`, never the values of records read first. A `ReferenceArrayField` ties itself by the JSON list of keys the same way, `related(id, tasks.waits, …)`. Terms nest for a list two levels deep.
- **Per record, in one read.** Inside a repeated record, such as a `CardRow` or a `RecordsIterator`, a list reads its `perPage` (or `limit`) for each record with [`limit_per`](/reference/api/#first-rows-per-value), and a `Stat` count is one `:aggregate` grouped by the field it ties itself by. Each nested read holds at most 500 records in all, the API's largest page, and the build warns when the records around it times its page are more, as some records would show fewer. A `ReferenceArrayField` there reads one page for all the records around it, of up to `perPage` records for each of them, since one record can sit in several lists. A `RecordRow` there needs a `limit`.
- **The page's own record.** A field of it that the address does not hold, `{{@root.project_id}}`, becomes `related()` on that record by its key, so the page's record is not read first. Page parameters and the page record's key stay `{{…}}` slots in the plan, which the address fills.
- **Indexes.** [`protobase doctor`](/reference/cli/#doctor) judges every planned read with the scan guard's rule, the outer reads its `related()` terms carry included, so it reports a nested read's missing index before the API refuses the read.

When a page opens, the web starts every read of its plan at once, with the page's parameters filled in, whatever a condition says and however deep a block sits. A `RecordCard`, `CardRow`, `Stat`, `ReferenceManyField`, `ReferenceArrayField` and `ReferenceField` then draw from their read and read nothing themselves; one inside the records of another takes the rows of its own record out of its read, by the field it ties itself by. Inside a record the plan did not read, such as one of a list's later pages, it reads its rows itself. A `Table`, `Thread`, `Chart` and `RecordCards`, the row a `select` chose, a `Thread`'s tool calls and each `<resource>.count` a condition names start in the same wave with the very request their block makes, labels, photos and totals included, so the block finds it loading or loaded once it draws and nothing is read twice. A `Table`, `Thread` or `RecordCards` inside the records of another draws its first rows from its planned read in the same way, its own record's out of all: that read asks for the names of the records its relations point at and its cards' photos, as the block's own read would, and beside it a count gives each record its total, so a table says "The first 10 of 37." for each record. Only what comes after, such as a thread's earlier messages or a table sorted by one of its headers, the block reads itself. A `Show` or `Match` decides only what is drawn: switching what it shows starts no new read. A change to a resource, live or the page's own, reads again exactly the reads of that resource, and a nested read also when the records around it change.

Each read in the plan (`page.reads.reads`) names its block by a JSON Pointer into the page's tree, such as `/children/0/children/2`, which `elementAt(tree, pointer)` finds. It gives the read's `resource`, its `kind` (`list`, `count` or `aggregate`), `filter`, `orderBy`, `pageSize`, `limitPer`, `groupBy`, `fields` (absent for every field), `etag`, and for a read inside the records of another its `split`: the `field` its rows hold the value `source`, a path, reads where the block draws, and the `parent` read, by `planReadId(read)`. `compileReadPlan(tree, { models })` makes the same plan from a tree of your own. `runReadPlan(plan, read, { params })` starts every read at once through `read` and gives each outcome by `planReadId`, and `plannedRows(read, rows, scope)` the rows of one record around a block.

A [custom component](/reference/custom-components/#reads) is planned when it declares its reads: the page starts them with the others, each of several a part of its own named by its resource prop (`/children/0#edges`), and the component draws from them. One that declares none is outside the plan (`page.reads.outside`): whatever it reads, it reads by itself once it draws, and `protobase doctor` lists it.

<gap>A `RecordRow` of a view with `listOf` or `searchesOf` cannot start its read when the page opens because starting the user's saved records or searches ahead of it is not implemented, so it reads once it draws, under a `Show` or `Match` once its condition holds.</gap> <gap>A `RecordRow` inside the records of another block cannot start its read when the page opens because a planned first page per record is not implemented, so it reads once it draws.</gap> <gap>A `Chart` cannot sit inside a repeated record because grouping a chart per record is not implemented.</gap> <gap>A `Table` or `RecordCards` tied by a JSON list of keys cannot show every record all its rows and its total when the lists around it hold more than 500 keys or rows in all because paging such a read is not implemented.</gap>

## Field values

:::caution[Beta]
A [`ReferenceField`](#related-records), a related record, cannot sit in a line of text yet, and these components may still change.
:::

The field components show one value of the record around them inside a line of text: in a `Text`, a `Link` or a `Summary`, beside words and links. They are [react-admin's field components](https://marmelab.com/react-admin/Fields.html), with the same names, props and defaults, so a layout reads as a react-admin page does. `source` is a [path](#paths-and-scopes), and a `source` no record around it has fails the build with the closest field, as any path does.

```tsx
<RecordCard resource="repairs" recordKey="42">
  <Details>
    <Summary><TextField source="bike" /> <ChipField source="state" /></Summary>
    <Text>Due <DateField source="due_at" format="relative" />, quoted at <NumberField source="quote" options={{ style: 'currency', currency: 'EUR' }} />.</Text>
    <Text>Paid: <BooleanField source="paid" />. Manual: <UrlField source="manual_url" content="Workshop manual" /></Text>
  </Details>
</RecordCard>
```

| Component | Shows | Props besides `source` and `emptyText` |
| --- | --- | --- |
| [`TextField`](https://marmelab.com/react-admin/TextField.html) | The value as text; an enum value as its label. | |
| [`NumberField`](https://marmelab.com/react-admin/NumberField.html) | A number, a numeric string read as one, formatted by `Intl.NumberFormat`. | `locales`, `options` |
| [`DateField`](https://marmelab.com/react-admin/DateField.html) | A date, by default without its time; a date-only value such as `2026-02-15` on its own day in every time zone. | `showDate` (default `true`), `showTime` (default `false`), `locales`, `options`, `format` |
| [`BooleanField`](https://marmelab.com/react-admin/BooleanField.html) | A check mark for true and the word for false. | `valueLabelTrue`, `valueLabelFalse` |
| [`UrlField`](https://marmelab.com/react-admin/UrlField.html) | A link to the address the value holds. | `content`, the link's text instead of the address |
| [`ChipField`](https://marmelab.com/react-admin/ChipField.html) | The value as a badge, in the view's value colours. | |

`emptyText` is shown when the value is empty, and nothing is shown without it. `locales` is a locale or a list of them, such as `nl-NL`, and is the reader's language when omitted; `options` are the `Intl` options, such as `{ style: 'currency', currency: 'EUR' }` or `{ dateStyle: 'long' }`, and locales or options `Intl` does not take fail the build. Where Protobase differs from react-admin:

- `DateField format="relative"`, which react-admin does not have, shows how long ago or ahead the moment is, such as "3 hours ago", as the lists show relative times. It takes no `showDate`, `showTime`, `locales` or `options`.
- A `DateField` with `showDate` and `showTime` both false, which react-admin refuses as it draws, fails the build.
- `UrlField` links only to an `http:`, `https:`, `mailto:` or `tel:` address or a path on the app's own origin; any other address, such as a `javascript:` one, shows as text. It cannot sit in a `Link`, as a link cannot hold a link.
- `TextField` and `ChipField` show an enum value by its label from the view, where react-admin shows the stored value.
- Props that take code in react-admin, such as `transform`, `render` or icons, are not taken: a layout holds data only.

<gap>A layout cannot show a related record's value inside a line of text with a `ReferenceField` because drawing a `ReferenceField` inline is not implemented; it stands on its own, as [related records](#related-records) show.</gap>

In the [text form](#text-form) each one reads as its formatted value, a `UrlField` as a Markdown link, and a `BooleanField` as Yes or No.

`Details` and `Summary` are HTML's [`<details>` and `<summary>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details): a line that opens to show the rest and closes again, by the browser alone, with no script. A `Details` takes one `Summary`, as its first child, and `open` to start open; a `Summary` holds one line, as a `Text` does, and sits in a `Details` only. In the text form a `Details` reads as its summary, then the rest.

## Paths and scopes

A `RecordCard`, a `ReferenceField`, each card of a `CardRow` and each entry of a [`RecordsIterator`](#related-records) put their record on a stack of records: an element inside both a task's `RecordCard` and a `CardRow` of its claims sits in a claim, inside the task. A bare name is looked up in the innermost record, then in each record further out, then in the page's own record; the [compatibility page](/features/compatibility/#template-paths) says which template syntax this follows:

| Path | Reads |
| --- | --- |
| `status` | The nearest record that has a field `status`, then each record around it in turn. |
| `meta.size` | `meta` as above, then `size` from that value only: when it has none, the path is empty, and no record further out is tried. |
| `../id`, `../../id` | The record one, or two, out from the nearest. |
| `this.id`, `./id` | The nearest record only. |
| `@index`, `@first`, `@last` | The card's place among a `CardRow`'s cards, or the entry's among a `RecordsIterator`'s, from 0, and whether it is the first or the last. |
| `@root.id` | The page's own record, in a [block tree on a record page](#record-pages). |
| `@params.window` | The [page parameter](#page-parameters) `window`, which a `SelectInput source="window"` on the page sets. |

`Field source`, a field component's `source`, `Diff source`, `Stat field`, `Progress`, and the names in a [condition](#conditions) take a path. A string prop takes `{{path}}` placeholders in double braces, filled with the path's value where the element draws, and empty when it has none:

- `title`, `description`, `empty`, `label`, and a field component's `emptyText`, `content`, `valueLabelTrue` and `valueLabelFalse` read any path: `<Table resource="claim_steps" title="Steps of {{title}}" />`.
- `filter`, `recordKey` and `values` read a field of a record around them. A filter takes one only as a top-level `AND` equality, `claim_id = {{id}} AND done = false`, the shape a read can take for every row at once with a [`related()`](/reference/api/#filtering-through-related-records) filter. A filter takes a page parameter anywhere.
- `when` takes them where a name cannot go, such as `this.status = '{{../status}}'`, since a name in AIP-160 cannot start with `../` or `@`.
- A [link's address](#addresses) takes them in its resource, key, tab, filter, order and values.

A placeholder quoted on its own in a filter or condition, `title = '{{title}}'`, is filled with its quotes and backslashes escaped, so any text stays one value: a placeholder is escaped for the string it lands in, not for HTML. One inside a longer quoted value, `title = 'about {{title}}'`, fails the build, as it would be filled unescaped. Paths are all a placeholder holds: no helpers, subexpressions, literals, `@key` or `{{{triple braces}}}`. A `{{…}}` that holds anything else fails as soon as the layout loads, before its names are checked.

The build checks every path where it sits:

- **Typos.** A name no record around it has fails, naming every record searched and the closest field: `"claimd_at" is no field of task_claims, tasks; did you mean claimed_at?`. A name the build accepts that has no value in a record draws empty.
- **Bad roots.** `../` past the outermost record, `@root` on a page without a record, `@index` outside a `CardRow` or `RecordsIterator`, and `@params.x` without a `SelectInput source="x"` on the page fail.
- **Reads that would wait.** A per-row value in a filter in any other place than a top-level `AND` equality (with `>=`, inside `OR` or `NOT`, a second one), `@index`, `@first`, `@last` or `this` in a filter, key or values, and any placeholder in `resource`, `sort`, `columns` or `limit` fail with "this would wait for the parent's rows": each block's records are one read of their own, and none may wait for another's rows.
- **Shadowing.** A bare name that more than one record around it has reads the nearest, and the build warns which it read and how to write the others: `"id" resolves to task_claims; write ../id for the one of tasks`. `protobase build --strict` fails on it instead. `this.`, `./`, `../` and `@` paths never warn.

## Record pages

:::caution[Beta]
A block tree on a record page sets no page parameters, chosen rows or tabs of its own, and may still change.
:::

A record page holds a tree of blocks among its items with `l.blocks(tree)`, in a [tab](/reference/ui-config/#tabs) or in the main column, beside its sections and related tables. The tree is written in JSX like a composed page's, and checked and read like one, inside the page's own record: `@root` is the record, and it is the last record a bare name reaches, so `{{title}}` and `{{@root.title}}` both read the record's title where no record nearer has one. The page keeps its address, `/<resource>/<key>`, its breadcrumbs, its place among the recent records and its actions.

```tsx
/** @jsxImportSource @protobase/layout */
import { Thread } from '@protobase/layout'
import { l, view } from '@protobase/schema'

export const tasksView = view<typeof tasks>('tasks').layout((r) => [
  l.tab('Task', [l.section('Task', [r.title, r.status])]),
  l.tab('Log', [l.blocks(<Thread title="Log of {{@root.title}}" resource="task_notes" filter="task_id = {{@root.id}}" time="noted_at" text="body" />)]),
])
```

The view's file is then `.tsx` and starts with the JSX import source, as a [layout file](#setup) does, or it imports the tree from a layout file of its own.

| | |
| --- | --- |
| `tree` | One element: any block or custom component but a `<Page>`. |
| `when` | `'editing'` or `'reading'` to show it only on the form or only on the read view, as other items take. |

Every block reads as it does on a composed page, all its reads started at once as the record page opens. The record's key comes from the address, so a filter that takes `{{@root.id}}` reads at once. A filter that takes another field of the record, such as `id = {{@root.owner_id}}`, reads with a [`related()`](/reference/api/#filtering-through-related-records) filter on the record by its key, so it does not wait for the record either. Blocks that work on a record, such as a `Field`, an `Action` or a custom component's `useLayoutRecord()`, work on the page's record where no record nearer is around them.

The server checks each tree against the resources when it starts, as it checks pages: a name the record does not have fails, naming the record's resource, `"titel" is no field of tasks (@root); did you mean title?`, and a name a nearer record shadows warns as [above](#paths-and-scopes). A `<Page>`, a `SelectInput`, `Tabs` or a block that chooses a row with `select` in the tree fails too, since the record page's address is the record's. <gap>A block tree on a record page cannot hold a `SelectInput`, `Tabs` or a `select` because page parameters, block tabs and chosen rows in a record page's address are not implemented.</gap> Each reader gets the tree without what they cannot read, and no tree when nothing of it is left.

## Page parameters

:::caution[Beta]
A page parameter holds one value, from a fixed list of choices.
:::

A page holds a choice in its own address: `SelectInput` draws a select whose choices each link to the page with that choice in the query, `/claims?window=30d`, and the layout reads the choice as `@params.window`. Reloading or sharing the address keeps it, and the browser's Back goes to the choice before. It takes the props of [react-admin's `SelectInput`](https://marmelab.com/react-admin/SelectInput.html): `source` names the parameter, `choices` lists `{ id, name }` objects, `label` is shown beside it, and `defaultValue` holds while the address names none of the choices. It writes into the page's address, not into a form.

```tsx
<Page title="Claims">
  <SelectInput source="window" label="Window" defaultValue="7d" choices={[{ id: '7d', name: 'Last 7 days' }, { id: '30d', name: 'Last 30 days' }]} />
  <Table resource="task_claims" title="Claims of the last {{@params.window}}" filter="claimed_at >= now() - {{@params.window}}" select="claim">
    <Field source="status" />
    <ReferenceField source="worker_id" reference="workers" />
  </Table>
</Page>
```

A value in the address that is none of the choices reads as `defaultValue`, and as empty without one. A filter that reads `@params` is checked once for each choice, and for the empty value when there is no `defaultValue`, so a choice that makes the filter invalid fails the build: `filter with window = "soon": …`. A `SelectInput` without `choices` shows the value its address gives as text; a `filter`, `recordKey` or `values` cannot read it, which fails the build, as any text in the address would reach the read.

A `Table` with `select` chooses one of its rows: each row links to the page with its key in the parameter `select` names, `?claim=11`, the chosen row looks selected and is marked `aria-current`, and the table's children draw under it inside that row's record, as inside a `RecordCard`. While no row is chosen they draw nothing, and Back clears the choice. A table with `select` shows its rows as a table, never in another display. Each parameter name is used once on a page, by one `SelectInput` or one `select`. A name is letters, digits and `_`, other than `__proto__`, and each choice's `id` is one the address can hold, never empty. A form under the chosen row asks before another row, or Back, replaces it, as before leaving the page.

In the [text form](#text-form), a `SelectInput` reads as its label and its choice's name, `**Window**: Last 30 days`, from the `params` you pass, and a `select` table's children as the row `records` gives for it.

A [`Timeline`](/reference/blocks/#timeline) takes `select` too: a bar links to the page with its `bar` value in the parameter, and its children draw inside the chosen bar's first record.

<gap>A data block other than a `Table` or a `Timeline`, or a list display such as a map, cannot take `select` because choosing a row there is not implemented.</gap>

## Conditions

`<Show when="...">` keeps its children while the condition holds, and draws its `fallback` while it does not; `<Switch>` draws the first of its `<Match when="...">` that holds, or its `fallback`, as [SolidJS's](https://docs.solidjs.com/reference/components/show) `Show`, `Switch` and `Match` do. A condition is AIP-160 over named values:

| Name | Value |
| --- | --- |
| `status`, `plan.name` | A field of the records around it, through relations, by the [lookup of paths](#paths-and-scopes). |
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

### Actions in a list

:::caution[Beta]
It runs only on the records the list has loaded, up to its `perPage` and any pages read with `pagination="more"`, and its dialog shows no progress, as for [signing several records off](/reference/blocks/#signing-several-records-off).
:::

Where an `Action` sits decides what it runs on. Directly in a `ReferenceManyField` or `ReferenceArrayField`, outside its `RecordsIterator`, it runs on every loaded record of that list; inside the `RecordsIterator`, it runs on the one record of its entry:

```tsx
<ReferenceManyField reference="approvals" target="release_id">
  <Action name="approve" />
  <RecordsIterator>
    <Card title="{{title}}"><Action name="approve" /></Card>
  </RecordsIterator>
</ReferenceManyField>
```

The list's button counts the records the action applies to, such as **Approve (3)**, and runs as a [selection in a list](/reference/blocks/#signing-several-records-off) does, whether or not the action has `bulk`: it asks its question or inputs once, a checklist shows each box once however many records hold it, and a record the person may not change is refused and named while the others run. It is not offered when the list holds no record the action applies to, and an `a.link` is not offered there. An `Action` with `resource` naming another resource keeps working as outside the list. In the [text form](#text-form), the list's action reads as its label alone, `Approve`. <gap>The text form cannot count the records a list's action applies to because the layout package has no resolver for whether an action applies to a record.</gap>

<gap>An `Action` in a list cannot run on records past the pages the list has loaded because reading the rest of a list for an action is not implemented.</gap>

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
| `{ kind: 'page', page, tab?, params? }` | A composed page; `tab` the name of one of its [tabs](/reference/blocks/#tabs-and-tab) (`/<page>/<tab>`), the first when omitted, and `params` its [page parameters](#page-parameters) by name (`?window=30d`). |

The resources, pages and fields an address names are checked when the server starts, like every other name.

## Access

Every block reads the regular API with the user's token, so the access rules apply to each request exactly as on the list and record pages: row filters such as `.own` narrow every count, table and card, and hidden fields never arrive.

`/api/meta` also gives each user the page without what they cannot use, the way views lose hidden fields:

- a page whose `roles` leave the user out is not sent;
- an element whose resource they cannot see, or whose filter or sort names a field they cannot read, is left out with everything inside it, and so is a `Tab` left with nothing in it;
- `Field`, `Diff`, `Progress` and `Stat field` on a field they cannot read are left out, and table columns are narrowed;
- `ModalForm` needs create or update permission and keeps only the fields they may write;
- an `Action` missing from their view of the resource is left out, and so is a `Show` that names something they cannot see.
- an `Image` whose function they may not call is left out; a fixed one (`src`) is kept.

Custom components are kept: they get only their props, and fetch through the same API. A custom component's fallback loses what the user cannot use like the rest of the tree, and a fallback left with nothing is sent as `[]`, so a client still draws nothing in the component's place.
