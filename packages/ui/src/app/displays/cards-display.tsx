import type { ReactNode } from 'react'
import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { displayValue } from '../../live/display-value'
import { fileShown, isPreviewable } from '../../live/file-values'
import { humanize } from '../../live/naming'
import { Badge } from '../../primitives/badge'
import { Skeleton } from '../../primitives/skeleton'
import { AppLink } from '../use-app-address'
import { shownWidget } from '../field-types/shown-widget'
import { WidgetPart } from '../field-types/widget-part'
import { namedIcon } from '../named-icon'
import { CustomBoundary } from '../pages/custom-boundary'
import { useProjectUi } from '../pages/project-ui'
import { ValueBadge } from '../value-badge'
import type { ListDisplay } from './display-context'
import { DisplayFooter, DisplayState } from './display-frame'
import { cardFields, filledMeta, type ListDisplayRow } from './list-displays'

type CardsProps = { model: ResourceModel; view: ViewModel | undefined; display: Extract<ListDisplayModel, { kind: 'cards' }>; list: ListDisplay }

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3'

// A picture across the card's top, from the edge of the card in: a raster image only, an empty frame otherwise.
const CardImage = ({ value }: { value: unknown }) => {
  const file = fileShown(value)
  const url = file && 'url' in file && typeof file.url === 'string' && isPreviewable(file.type) ? file.url : undefined
  return (
    <span className="-mx-3 -mt-3 mb-1.5 block aspect-[4/3] overflow-hidden rounded-t-lg border-b border-border bg-muted">
      {url && <img src={url} alt="" loading="lazy" className="size-full object-cover" />}
    </span>
  )
}

// A meta field's value after the icon its view names.
const MetaValue = ({ icon, children }: { icon: string | undefined; children: ReactNode }) => {
  const Icon = namedIcon(icon)
  return (
    <dd className="flex items-center gap-1 tabular-nums">
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      {children}
    </dd>
  )
}

/**
 * A card per record, opening its page: its image across the top, the title over the subtitle, the badge beside it,
 * small meta fields below, those with a value, and the labels of its flags that are true; or, with a `card` component,
 * what it draws of the row, the built-in content again when it is missing or throws.
 */
export const CardsDisplay = ({ model, view, display, list }: CardsProps) => {
  const { image, title, subtitle, badge, meta, flags } = cardFields(model, view, display)
  const label = (name: string) => view?.fields[name]?.label ?? humanize(name)
  const text = (row: ListDisplayRow, name: string) => {
    const field = model.fields[name]
    if (!field) return ''
    return row.labels[name] ?? displayValue(field, row.record[name], view?.fields[name])
  }
  // A field the view shows with a field type draws its display
  const { fields: fieldTypes, components } = useProjectUi()
  const Card = display.card === undefined ? undefined : components?.[display.card]
  const shownValue = (row: ListDisplayRow, name: string) => {
    const field = model.fields[name]
    const shown = field && shownWidget(fieldTypes, field, view?.fields[name])
    return shown ? <WidgetPart shown={shown} part="display" field={field} value={row.record[name]} fallback={text(row, name)} /> : text(row, name)
  }
  // A meta field the view formats as a badge shows as one, unless a field type draws it
  const metaValue = (row: ListDisplayRow, name: string) => {
    const field = model.fields[name]
    const hints = view?.fields[name]
    const value = row.record[name]
    if (!field || hints?.format !== 'badge' || shownWidget(fieldTypes, field, hints) || value === null || value === undefined || value === '') return shownValue(row, name)
    return (
      <ValueBadge value={value} hints={hints}>
        {text(row, name)}
      </ValueBadge>
    )
  }
  const plural = (view?.names?.plural ?? humanize(model.name)).toLowerCase()

  return (
    <DisplayState list={list} empty={`No ${plural} match.`} loading={<div className={grid}>{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>}>
      <ul className={grid} aria-label={view?.names?.plural ?? humanize(model.name)}>
        {list.rows.map((row) => {
          const status = badge === undefined ? undefined : row.record[badge]
          const raised = flags.filter((name) => row.record[name] === true)
          const builtIn = (
            <>
              {image !== undefined && <CardImage value={row.record[image]} />}
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{shownValue(row, title)}</span>
                {badge !== undefined && status !== null && status !== undefined && (
                  <ValueBadge value={status} hints={view?.fields[badge]}>
                    {text(row, badge)}
                  </ValueBadge>
                )}
              </span>
              {subtitle !== undefined && <span className="truncate text-muted-foreground">{shownValue(row, subtitle)}</span>}
              {meta.length > 0 && (
                <dl className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-1 text-xs text-muted-foreground">
                  {filledMeta(row, meta).map((name) => (
                    <div key={name} className="flex gap-1">
                      <dt className="sr-only">{label(name)}</dt>
                      <MetaValue icon={view?.fields[name]?.icon}>{metaValue(row, name)}</MetaValue>
                    </div>
                  ))}
                </dl>
              )}
              {raised.length > 0 && (
                <ul className="flex flex-wrap gap-1" aria-label="Features">
                  {raised.map((name) => (
                    <li key={name}>
                      <Badge dot={false}>{label(name)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
          return (
            <li key={row.key}>
              <AppLink
                to={{ kind: 'record', resource: model.name, key: row.key }}
                className="flex h-full flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-[13px] hover:border-border-strong hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {Card ? (
                  <CustomBoundary name={display.card!} fallback={builtIn}>
                    <Card row={row} />
                  </CustomBoundary>
                ) : (
                  builtIn
                )}
              </AppLink>
            </li>
          )
        })}
      </ul>
      <DisplayFooter list={list} />
    </DisplayState>
  )
}
