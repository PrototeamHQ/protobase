---
title: Exporting a list
description: Let users save a list as an Excel or CSV file, limit how many rows a file holds, or take Export off a list.
---

Every list in the admin can be saved as a file: Rijnland's finance team wants this month's invoices in Excel, and the warehouse wants a CSV of the stock moves for a supplier. Nothing needs setting up for that; this guide shows what users get, and how a view limits it or takes it away. It uses the ERP example (`examples/erp`).

## 1. Export a list

Run `bun run protobase dev`, open the orders and filter them, by status for instance. **Export** beside the title opens a dialog:

- **Format**: an Excel workbook (`.xlsx`) or a CSV file.
- **Rows**: the orders the list finds, with its filters, search and sort. With orders selected in the table, **Export N** beside **Delete N** opens the same dialog with the selected ones.
- **Values**: **As shown** writes what the list shows, such as "Shipped" and the company's name; **Raw values** writes what is stored, such as `shipped` and the company's key.
- **Columns**: the list's columns, in its order. Tick other fields to add them, and move any column up or down.

The dialog says how many rows that is. **Export** asks where to save the file in Chrome and Edge, which then write it as it is built, and downloads it in other browsers. The browser builds the file while it reads the orders page by page, so a large export costs the server no more than scrolling through the list would; **Cancel** stops it.

## 2. Limit or take it off

A view can limit how many rows one file holds, or take Export off its list:

```ts
// config/orders/ui.ts
export const ordersView = view<typeof orders>('orders')
  // ...
  .export({ maxRows: 50_000 })
```

```ts
// config/stock_moves/ui.ts
export const stockMovesView = view<typeof stockMoves>('stock_moves')
  // ...
  .export(false)
```

With a limit, the dialog says when the list finds more rows than a file holds, and the file holds the first ones in the list's order.

## 3. What a file holds

A file holds what the user could read in the list, and no more: the rows come from the same list API, as that user, so their role's [row filters and field lists](/reference/access/#capabilities) apply, and a [sensitive field](/reference/data-config/#sensitive-fields) is never offered. To keep a field out of someone's exports, keep it out of what their role may read. A view's limit only shapes the page; someone who may read the orders can still read them all through the API.

The [UI config](/reference/ui-config/#exports) has the details: how cells are typed in a workbook, how a CSV file is quoted, and how files are named.
