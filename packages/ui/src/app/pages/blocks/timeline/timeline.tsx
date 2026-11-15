import { useState, type ReactNode } from 'react'
import { timelineSort, type Styled, type TimelineProps } from '@protobase/layout'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { Skeleton } from '../../../../primitives/skeleton'
import { ErrorBanner } from '../../../error-banner'
import { GuardedParams } from '../../../guarded-params'
import { useAdminMeta } from '../../../meta-gate'
import { cn } from '../../../../lib/cn'
import { groupFilter } from '../../../charts/chart-groups'
import { text } from '../../messages'
import { usePageParams } from '../../page-params'
import { usePlanned } from '../../plan-reads'
import { useListPage } from '../../use-layout-data'
import { propsOf, type BlockProps } from '../block-props'
import { CardFrame, Quiet } from '../card-frame'
import { ChosenRecord } from '../chosen-record'
import { barIdOf, barIn, type BarId } from './bar-identity'
import { timelineShape, type TimelineBar, type TimelineFields } from './timeline-layout'
import { TimelineLanes, type LanesProps } from './timeline-lanes'
import { TimelineLegend, TimelineReadout } from './timeline-readout'

type LoadedProps = Omit<TimelineProps, 'resource' | 'actions' | 'children' | 'select' | 'lane' | 'bar' | 'start' | 'end' | 'color'> & {
  model: ResourceModel
  view: ViewModel | undefined
  fields: TimelineFields
  sort: string
  at?: string
  actions: ReactNode
  className?: string
  choose?: LanesProps['choose']
  details?: ReactNode
}

// Its records from the page's planned read, or a read of its own, the earliest first, drawn as lanes with what the
// bar pointed at holds under them
const LoadedTimeline = ({ model, view, fields, sort, at, filter, limit = 500, title, description, empty, actions, className, choose, details }: LoadedProps) => {
  // The bar under the pointer shows over the one with focus, which shows again once the pointer leaves; each is kept
  // by its identity and found in the current data, so the readout follows a refresh and drops a bar that is gone
  const [hovered, setHovered] = useState<BarId | null>(null)
  const [focused, setFocused] = useState<BarId | null>(null)
  const idOf = (bar: TimelineBar | null) => (bar ? barIdOf(bar) : null)
  const point = { hover: (bar: TimelineBar | null) => setHovered(idOf(bar)), focus: (bar: TimelineBar | null) => setFocused(idOf(bar)) }
  const planned = usePlanned(at)
  const own = useListPage(model, { filter, sort, pageSize: limit, enabled: !planned })
  const page = planned ?? own
  const rows = planned ? planned.rows : (own.data?.items ?? [])
  const shape = timelineShape(rows, fields, Date.now())
  const body = () => {
    if (page.isPending) return <div className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-6" />)}</div>
    if (page.error) return <ErrorBanner title={text('couldNotLoad')} error={page.error} />
    if (shape.lanes.length === 0) return <Quiet>{empty ?? text('nothingYet')}</Quiet>
    const values = new Set(rows.map((row) => String(row[fields.color])))
    return (
      <div className="flex flex-col gap-4">
        <TimelineLegend model={model} view={view} fields={fields} values={values} />
        <TimelineLanes shape={shape} model={model} view={view} fields={fields} point={point} {...(choose && { choose })} />
        <div aria-live="polite">
          <TimelineReadout bar={barIn(shape, hovered) ?? barIn(shape, focused)} model={model} view={view} fields={fields} />
        </div>
      </div>
    )
  }
  return (
    <CardFrame title={title} description={description} actions={actions} className={cn('h-full', className)}>
      {body()}
      {details}
    </CardFrame>
  )
}

// The bar a key names, as its `bar` field holds it: a number for an integer field, the text otherwise, as the API
// gives a bigint or decimal, whose digits a number would round
const barValue = (field: FieldModel, key: string) => (field.type === 'integer' ? Number(key) : key)

/** A timeline whose bars each link to the page with that bar's value in the parameter `select`, and the chosen bar's children under it. */
const SelectTimeline = ({ select, children, ...props }: LoadedProps & { select: string; children: ReactNode[] }) => {
  const { given, linkTo } = usePageParams()
  const key = given[select]
  const barTo = (barKey: string) => linkTo({ [select]: barKey })
  const field = props.model.fields[props.fields.bar]!
  // The chosen bar's first record among those the timeline shows; a form under it asks before another bar replaces it
  const details =
    key === undefined ? null : (
      <GuardedParams name={select}>
        <ChosenRecord key={key} model={props.model} query={{ filter: groupFilter(field, barValue(field, key), props.filter), sort: props.sort }}>
          {children}
        </ChosenRecord>
      </GuardedParams>
    )
  return <LoadedTimeline {...props} choose={{ barTo, chosen: key }} details={details} />
}

/**
 * Records as a timeline: a lane per `lane` value, a bar per `bar` value in it, each record a segment from `start` to
 * `end` coloured by its `color` value, the bar pointed at with its times under them. With `select`, a bar leads to the
 * page with it chosen, and the chosen bar's first record draws the children under the timeline.
 */
export const TimelineBlock = ({ node, at, slots, children, className }: BlockProps) => {
  const { className: _className, resource, select, lane, bar, start, end, color, children: _children, ...props } = propsOf<TimelineProps & Styled>(node)
  const { resources, views } = useAdminMeta()
  const model = resources[resource]
  if (!model) return null
  const loaded = { ...props, model, view: views[model.name], fields: { lane, bar, start, end, color }, sort: timelineSort(node), ...(at !== undefined && { at }), actions: slots.actions, className }
  if (select === undefined) return <LoadedTimeline {...loaded} />
  return (
    <SelectTimeline {...loaded} select={select}>
      {children}
    </SelectTimeline>
  )
}
