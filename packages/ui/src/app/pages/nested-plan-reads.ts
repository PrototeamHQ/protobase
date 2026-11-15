import type { LayoutNode, PlanRead, RecordCardsProps, TableProps, ThreadProps } from '@protobase/layout'
import { columnName } from '@protobase/layout'
import { listLabels } from '../../live/relation-labels'
import { listPhotos } from '../../live/row-photos'
import { seedTitleRows } from '../../live/title-rows'
import type { PlannedExtras, PlannedPage } from '../../data/read-planned'
import { embeddedFields } from '../embedded-list/embedded-fields'
import { defaultOrderBy } from '../list-order'
import type { PlanReader } from './block-query'
import { propsOf } from './blocks/block-props'
import { phoneSpecs } from './blocks/table-phone-columns'

// A Table, RecordCards or Thread inside the records of another draws its first page from its planned read, so that
// read asks for what the block's own read would: the names of its relations, its cards' photos, its fields and its
// order. Their names and photos are by key, so each record around it finds those of its own rows among them.

/** How a nested block's planned read is made: the read as sent, what it asks for beside its rows, and what it does with them. */
export type NestedRead = { read: PlanRead; extras: PlannedExtras; then?: (page: PlannedPage) => Promise<void> }

/** The order the block reads in without its own, an empty one as none: the list's, or the API's when the list has none. */
export const orderOf = (read: PlanRead, own: string | undefined) => read.orderBy || own || undefined

// The fields the table reads besides those the plan names, unless either reads them all
const withFields = (planned: string[] | undefined, own: string[] | undefined) => (planned && own ? [...new Set([...planned, ...own])].sort() : undefined)

const tableRead = (node: LayoutNode, read: PlanRead, reader: PlanReader): NestedRead | undefined => {
  const { resource, columns, button, bulk = false } = propsOf<TableProps>(node)
  const model = resource === undefined ? undefined : reader.resources[resource]
  if (!model) return
  const view = reader.views[model.name]
  const { fields, read: own } = embeddedFields({ ...reader, model, view, columns: columns?.map(columnName), button, bulk, phoneColumns: phoneSpecs(columns) })
  const photos = listPhotos(view)
  return {
    read: { ...read, orderBy: orderOf(read, defaultOrderBy(model, view)), fields: withFields(read.fields, own) },
    extras: { labels: listLabels(reader.resources, reader.views, model, fields), ...(photos && { photos }) },
    then: (page) => seedTitleRows(reader.queryClient, reader.client, reader.resources, reader.views, model, fields, page.rows),
  }
}

// Its cards show each record's title, so they read whole records, as the block's own read does
const cardsRead = (node: LayoutNode, read: PlanRead, reader: PlanReader): NestedRead | undefined => {
  const model = reader.resources[propsOf<RecordCardsProps>(node).resource]
  if (!model) return
  return { read: { ...read, orderBy: orderOf(read, defaultOrderBy(model, reader.views[model.name])), fields: undefined }, extras: {} }
}

const threadRead = (node: LayoutNode, read: PlanRead, reader: PlanReader): NestedRead | undefined => {
  if (read.part === 'calls') return { read, extras: {} }
  const { resource, sender } = propsOf<ThreadProps>(node)
  const model = reader.resources[resource]
  if (!model) return
  return { read, extras: { labels: listLabels(reader.resources, reader.views, model, [sender]) } }
}

const byType: Record<string, (node: LayoutNode, read: PlanRead, reader: PlanReader) => NestedRead | undefined> = { Table: tableRead, RecordCards: cardsRead, Thread: threadRead }

/**
 * The planned read of a `Table`, `RecordCards` or `Thread` inside the records of another, and its total per record,
 * as the block draws them; `undefined` for any other read, which the block makes as it draws.
 */
export const nestedRead = (node: LayoutNode, read: PlanRead, reader: PlanReader): NestedRead | undefined => {
  if (!read.split || node.custom) return
  if (read.part === 'total') return { read, extras: {} }
  if (read.part !== undefined && read.part !== 'calls') return
  return byType[node.type]?.(node, read, reader)
}
