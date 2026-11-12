import { ArrowRight, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import { useIsXs } from '../../lib/use-media-query'
import { recordKey } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { buttonClass } from '../../primitives/button'
import { Skeleton } from '../../primitives/skeleton'
import { Section } from '../../record-view'
import { embeddedDisplay, viewAllAddress } from '../embedded-list/embedded-display'
import { text as listText } from '../embedded-list/messages'
import { ErrorBanner } from '../error-banner'
import { defaultOrderBy } from '../list-order'
import { scopeOf, useListPage } from '../pages/use-layout-data'
import { RowButtonLink } from '../row-button/row-button-link'
import type { CurrentAddress } from '../current-address'
import { AppLink } from '../use-app-address'
import { RelatedField } from './related-field'
import { text } from './messages'

type RelatedRecordProps = {
  title: string
  help?: string
  /** What shows after the title, such as how many records match. */
  count?: ReactNode
  model: ResourceModel
  view: ViewModel | undefined
  filter: string
  /** The order that picks the record, the list's own when empty. */
  sort: string
  /** The fields it shows, in full. */
  fields: string[]
  /** A button to an address the record's fields name. */
  button?: RowButtonModel
  empty?: string
  /** Where a record is started while none matches, when the user may create one. */
  add?: CurrentAddress
}

const Empty = ({ empty }: { empty: string | undefined }) => <p className="text-muted-foreground">{empty ?? text('nothingYet')}</p>

const singularOf = (model: ResourceModel, view: ViewModel | undefined) => (view?.names?.singular ?? humanize(model.name)).toLowerCase()

/**
 * A record page section showing the first record a filter finds as part of the page rather than a card: its `fields`
 * in full, under their labels when there are several and alone when there is one, with a link to its own page and
 * `button` on the heading's line, or, while none matches, a link to `add` one. A second record is read only to tell there are more, when "View all" opens them.
 */
export const RelatedRecord = ({ title, help, count, model, view, filter, sort, fields, button, empty, add }: RelatedRecordProps) => {
  const xs = useIsXs()
  const orderBy = sort || defaultOrderBy(model, view)
  const page = useListPage(model, { filter, sort: orderBy, pageSize: 2 })
  if (page.isPending) return <Section title={title} help={help} count={count}><Skeleton className="h-24 w-full" /></Section>
  if (page.error) return <Section title={title} help={help} count={count}><ErrorBanner title={text('couldNotLoad')} error={page.error} /></Section>
  const [row, next] = page.data.items
  if (!row) {
    const adding = add && (
      <AppLink to={add} className={buttonClass({ size: 'sm' })}>
        <Plus className="size-3.5" />
        {text('add', { singular: singularOf(model, view) })}
      </AppLink>
    )
    return <Section title={title} help={help} count={count} actions={adding}><Empty empty={empty} /></Section>
  }
  const scope = scopeOf(model, row)
  const singular = singularOf(model, view)
  const plural = view?.names?.plural ?? humanize(model.name)
  const labelled = fields.length > 1
  const shown = fields.map((path) => <RelatedField key={path} scope={scope} path={path} labelled={labelled} />)
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {button && <RowButtonLink button={button} model={model} view={view} record={row} />}
      <AppLink to={{ kind: 'record', resource: model.name, key: recordKey(model, row) }} className={buttonClass({ size: 'sm' })}>
        {text('open', { singular })}
      </AppLink>
    </div>
  )
  return (
    <Section title={title} help={help} count={count} actions={actions}>
      <div className="flex min-w-0 flex-col gap-4">
        {labelled ? <dl className="flex flex-col gap-4">{shown}</dl> : shown}
        {next && (
          <AppLink to={viewAllAddress(model, view, xs, { filter, orderBy, display: embeddedDisplay(view, xs, {}) })} className="flex items-center gap-1 self-start font-medium text-primary-text hover:underline">
            {listText('viewAll')} <span className="sr-only">{plural.toLowerCase()}</span>
            <ArrowRight className="size-3.5" aria-hidden />
          </AppLink>
        )}
      </div>
    </Section>
  )
}
