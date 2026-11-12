import { useState, type ReactNode } from 'react'
import { createWhere, printFilter, type RelatedModel } from '@protobase/schema'
import { listColumnNames } from '../live/columns-from-model'
import { Section } from '../record-view'
import { HeadingCount } from '../record-view/heading-count'
import { EmbeddedDisplaySwitch, EmbeddedList } from './embedded-list/embedded-list'
import { useEmbeddedDisplay } from './embedded-list/use-embedded-display'
import { RelatedCards } from './related-cards/related-cards'
import { RelatedRecord } from './related-cards/related-record'
import { relatedOpens } from './related-opens'
import { relatedMatch } from './related-match'
import { useRelatedCount } from './related-count'
import { relatedHandOrder } from './hand-order/hand-order'
import { HandSortedList } from './hand-order/hand-sorted-list'
import { ReorderButton } from './hand-order/reorder-button'
import { useAdminMeta, usePermissions } from './meta-gate'
import { text } from './record-messages'

const where = createWhere()

const Empty = ({ empty }: { empty: string | undefined }) => <p className="text-muted-foreground">{empty ?? text('nothingYet')}</p>

/**
 * A record page section listing the first records of another resource that point at this record, directly or through
 * a join resource, in the list page's table or display, or as cards with their actions, with a link to them all in the list,
 * or the first one's fields in full. When they are ordered by
 * hand within this record, **Reorder** shows them all in their order, to be moved by their drag handles.
 */
export const RelatedSection = ({ item, value, owner }: { item: RelatedModel; value: string | number | boolean | null; owner: string }) => {
  const { resources, views } = useAdminMeta()
  const model = resources[item.resource]
  const view = model && views[model.name]
  const match = relatedMatch(item, value, resources)
  const [display, pick] = useEmbeddedDisplay(view, `related:${owner}:${item.title}`, item.display)
  const permissions = usePermissions(item.resource)
  const [sorting, setSorting] = useState(false)
  // Only a section that hides while empty or shows its count counts its records
  const count = useRelatedCount([{ item, value }], Boolean(item.hideEmpty || item.count))
  if (!model) return null
  if (item.hideEmpty && (count === undefined || count === 0)) return null
  const heading = { title: item.title, help: item.help, count: item.count ? <HeadingCount count={count} names={view?.names} /> : undefined }
  const opens = relatedOpens(item, model, resources)
  // The relation names this record on every row, so it is left out of the default columns
  const columns = item.columns ?? listColumnNames(model, view).filter((name) => name !== item.field)
  // What it lists, when it can match any record
  const listed = (list: (filter: string) => ReactNode) => (match === null ? <Empty empty={item.empty} /> : list(match))
  if (item.presentation === 'cards' || item.presentation === 'compact') {
    const compact = item.presentation === 'compact' ? { time: item.time } : undefined
    // The time beside a compact card's title is not shown again among its values; the tone's value shows first, so its
    // colour is never all that says it
    const shown = compact ? columns.filter((name) => name !== item.time) : columns
    const values = item.tone === undefined || shown.includes(item.tone) ? shown : [item.tone, ...shown]
    return (
      <Section {...heading}>
        {listed((filter) => <RelatedCards model={model} view={view} filter={filter} sort={item.sort ?? ''} fields={values} actions={item.actions ?? []} button={item.button} limit={item.limit ?? 10} display={item.display} empty={item.empty} compact={compact} tone={item.tone} />)}
      </Section>
    )
  }
  if (item.presentation === 'record') {
    if (match === null) return <Section {...heading}><Empty empty={item.empty} /></Section>
    // A new match starts afresh, so the previous record never shows while its query loads
    return <RelatedRecord key={match} {...heading} model={model} view={view} filter={match} sort={item.sort ?? ''} fields={columns} button={item.button} empty={item.empty} />
  }
  const handOrder = relatedHandOrder(item, model, permissions)
  const displaySwitch = <EmbeddedDisplaySwitch view={view} value={display} onChange={pick} />
  const actions = handOrder ? (
    <div className="flex items-center gap-2">
      {!sorting && displaySwitch}
      <ReorderButton size="sm" sorting={sorting} onChange={setSorting} />
    </div>
  ) : (
    displaySwitch
  )
  if (sorting && handOrder) {
    return (
      <Section {...heading} actions={actions}>
        <HandSortedList model={model} view={view} field={handOrder} filter={printFilter(where.eq(item.field, value!))} columns={columns} />
      </Section>
    )
  }
  return (
    <Section {...heading} actions={actions}>
      {listed((filter) => <EmbeddedList key={filter} model={model} view={view} filter={filter} sort={item.sort ?? ''} columns={columns} limit={item.limit ?? 10} display={display} empty={item.empty} opens={opens} button={item.button} />)}
    </Section>
  )
}
