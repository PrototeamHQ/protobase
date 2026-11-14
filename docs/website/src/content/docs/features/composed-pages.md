---
title: Composed pages
description: Pages of your own, built from blocks in a JSX layout.
---

- [Composed pages](/reference/layouts/#setup): Pages built from a JSX layout, with their own address, sidebar entry and role limits, reading the API under the same access rules as the lists.
- [Layout checks](/reference/layouts/#what-a-layout-may-hold): The build refuses a layout with code, unknown props or unknown fields, and names the file and place.
- [Conditions](/reference/layouts/#conditions): Part of a page shows only while a condition on a record or a count holds.
- [Paths and scopes](/reference/layouts/#paths-and-scopes) (beta): Layout values resolve through the records around them with paths relative to those records, such as `../name`, `this.name` and `@index`; typos and reads that would wait on other reads fail the build, and `Show`, `Switch` and `Match` choose what is drawn.
- [Field values and expanding lines](/reference/layouts/#field-values) (beta): Layouts show a record's values inline in text and links with react-admin's field components, such as `DateField` and `NumberField`, and a line that opens to show more with `Details` and `Summary`.
- [App addresses](/reference/layouts/#addresses): Links to lists, records, create forms and pages are typed addresses that can carry filters and prefilled values.
- [Component fallbacks](/reference/custom-components/#fallbacks): A custom component declares what a client that cannot draw it shows instead, or nothing, and the web shows it too when the component is missing or throws.
- [Text form](/reference/layouts/#text-form): Every layout block renders to Markdown text through one shared function, built up from its children, as the last-resort fallback and for MCP clients and LLMs.
- [Per-user pages](/reference/layouts/#access): Each user gets the page without the parts, fields and actions they cannot use.
- [Layout blocks](/reference/blocks/#layout): Pages, responsive grids, cards and links.
- [Tailwind classes](/reference/layouts/#tailwind-classes) (experimental): Layouts can carry Tailwind classes, on plain elements and on blocks, for pages too custom for blocks.
- [Full-width pages](/reference/blocks/#page): A page fills the whole area beside the sidebar instead of a centred column, for a dashboard with many blocks.
- [Data blocks](/reference/blocks/#data): Counts, tables, single records, rows of cards, field values and progress bars.
- [Related records](/reference/layouts/#related-records) (beta): Layouts repeat over a record's related records, the records a JSON list of keys points at and the items of a JSON list with `ReferenceManyField`, `ReferenceArrayField`, `ArrayField`, `RecordsIterator` and `ReferenceField`, nested as deep as needed, and a table draws such a list.
- [Table columns on a phone](/reference/blocks/#columns-on-a-phone): Table blocks choose which columns show at mobile width by priority, with a sensible default, and fall back to a Markdown table.
- [Row buttons](/reference/blocks/#row-buttons) (experimental): A table's rows carry a button labelled by a field of the row, such as its next step; the row decides where it goes: a record tab a field names, a list with a filter built from its fields, or an outside https link a field holds. On mobile width the button sits under the row's first cell.
- [Record rows](/reference/blocks/#recordrow): A sideways row of cards for a filter, favorites or saved searches, with a count and new-record marks.
- [Record cards](/reference/blocks/#recordcards): Full-width cards with fields and buttons, stacked or in a carousel.
- [Image block](/reference/blocks/#image): A picture one of the app's API functions draws for the reader, such as a system map, at the size and theme the client asks, refreshed on a timer; a client that draws no images shows its alt text, or nothing.
- [Chart block](/reference/blocks/#chart): Counts, sums or averages by value or by date, as bars, lines or a donut, and over time split by a second field.
- [Conversations](/reference/blocks/#conversation): A chat declared in the layout: a thread of a resource's messages under each sender's name and time, following new ones as they arrive, and a box that sends one as the signed-in user.
- [Tool calls in threads](/reference/blocks/#tool-calls): Conversation threads show tool calls in time order, with a status and an expandable input and result.
- [Buttons and forms](/reference/blocks/#behaviour): Buttons for named actions, and create or edit forms in a dialog.
- [Settings block](/reference/blocks/#settings): Each person's own settings from a resource with one record per person, saved as they change, with defaults until the first save.
- [Users block](/reference/blocks/#users): User management on any page: find users, set roles, block them and invite by email.
