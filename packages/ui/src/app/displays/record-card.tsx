import type { ReactNode } from 'react'
import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { displayValue } from '../../live/display-value'
import { FileImage } from '../../live/file-image'
import { shownImage } from '../../live/file-values'
import { humanize } from '../../live/naming'
import { Badge } from '../../primitives/badge'
import { AppLink } from '../use-app-address'
import { shownWidget } from '../field-types/shown-widget'
import { WidgetPart } from '../field-types/widget-part'
import { namedIcon } from '../named-icon'
import { CustomBoundary } from '../pages/custom-boundary'
import { useProjectUi } from '../pages/project-ui'
import { ValueBadge } from '../value-badge'
import { CardCarousel } from './card-carousel'
import { amountParts, cardFields, filledAmount, filledMeta, type ListDisplayRow } from './list-displays'

type RecordCardProps = { model: ResourceModel; view: ViewModel | undefined; display: Extract<ListDisplayModel, { kind: 'cards' }>; row: ListDisplayRow }

// A picture across the card's top, from the edge of the card in: a raster image only, an empty frame otherwise.
const CardImage = ({ value }: { value: unknown }) => {
  const image = shownImage(value, { width: 320, height: 240 })
  return (
    <span className="-mx-3 -mt-3 mb-1.5 block aspect-[4/3] overflow-hidden rounded-t-lg border-b border-border bg-muted">
      {image && <FileImage image={image} loading="lazy" className="size-full object-cover" />}
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
 * A record's card of a cards display, opening its page: its image across the top, with arrows through its photos when
 * the display names them, the title over the subtitle, the badge beside it, the first amount with a value in bold, small
 * meta fields below, those with a value, the labels of its flags that are true and the footer's fields with a value,
 * joined by bullets; or, with a `card` component, what it draws of the row, the built-in content again when it is
 * missing or throws.
 */
export const RecordCard = ({ model, view, display, row }: RecordCardProps) => {
  const { image, title, subtitle, amount, badge, meta, footer, flags } = cardFields(model, view, display)
  const label = (name: string) => view?.fields[name]?.label ?? humanize(name)
  const text = (name: string) => {
    const field = model.fields[name]
    if (!field) return ''
    return row.labels[name] ?? displayValue(field, row.record[name], view?.fields[name])
  }
  // A field the view shows with a field type draws its display
  const { fields: fieldTypes, components } = useProjectUi()
  const Card = display.card === undefined ? undefined : components?.[display.card]
  const shownValue = (name: string) => {
    const field = model.fields[name]
    const shown = field && shownWidget(fieldTypes, field, view?.fields[name])
    return shown ? <WidgetPart shown={shown} part="display" field={field} value={row.record[name]} fallback={text(name)} /> : text(name)
  }
  // A meta field the view formats as a badge shows as one, unless a field type draws it
  const metaValue = (name: string) => {
    const field = model.fields[name]
    const hints = view?.fields[name]
    const value = row.record[name]
    if (!field || hints?.format !== 'badge' || shownWidget(fieldTypes, field, hints) || value === null || value === undefined || value === '') return shownValue(name)
    return (
      <ValueBadge value={value} hints={hints}>
        {text(name)}
      </ValueBadge>
    )
  }
  // The amount in bold, its suffix such as ` /month` not; a relation's name or a field type's display in bold whole
  const amountValue = (name: string) => {
    const field = model.fields[name]
    if (!field) return undefined
    if (row.labels[name] !== undefined || shownWidget(fieldTypes, field, view?.fields[name])) return <strong className="font-semibold text-foreground">{shownValue(name)}</strong>
    const parts = amountParts(field, row.record[name], view?.fields[name])
    return (
      <>
        <strong className="font-semibold text-foreground">{parts.amount}</strong>
        {parts.suffix}
      </>
    )
  }
  // A card component draws its own content, so only the built-in card steps through photos
  const photos = Card ? undefined : display.photos
  const status = badge === undefined ? undefined : row.record[badge]
  const raised = flags.filter((name) => row.record[name] === true)
  const cover = image === undefined ? undefined : row.record[image]
  const shownAmount = filledAmount(row, amount)
  const footing = filledMeta(row, footer)
  const builtIn = (photo: unknown) => (
    <>
      {(image !== undefined || photos !== undefined) && <CardImage value={photo} />}
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{shownValue(title)}</span>
        {badge !== undefined && status !== null && status !== undefined && (
          <ValueBadge value={status} hints={view?.fields[badge]}>
            {text(badge)}
          </ValueBadge>
        )}
      </span>
      {subtitle !== undefined && <span className="truncate text-muted-foreground">{shownValue(subtitle)}</span>}
      {shownAmount !== undefined && <span className="truncate tabular-nums text-muted-foreground">{amountValue(shownAmount)}</span>}
      {meta.length > 0 && (
        <dl className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-1 text-xs text-muted-foreground">
          {filledMeta(row, meta).map((name) => (
            <div key={name} className="flex gap-1">
              <dt className="sr-only">{label(name)}</dt>
              <MetaValue icon={view?.fields[name]?.icon}>{metaValue(name)}</MetaValue>
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
      {footing.length > 0 && (
        <span className={`truncate text-xs text-muted-foreground ${meta.length > 0 ? '' : 'mt-auto'}`}>
          {footing.map((name, index) => (
            <span key={name}>
              {index > 0 && <span aria-hidden> • </span>}
              {shownValue(name)}
            </span>
          ))}
        </span>
      )}
    </>
  )
  const card = (photo: unknown) => (
    <AppLink
      to={{ kind: 'record', resource: model.name, key: row.key }}
      className="flex h-full flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-[13px] hover:border-border-strong hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      {Card ? (
        <CustomBoundary name={display.card!} fallback={builtIn(photo)}>
          <Card row={row} />
        </CustomBoundary>
      ) : (
        builtIn(photo)
      )}
    </AppLink>
  )
  return (
    <div className={photos ? 'group/card relative h-full' : 'h-full'}>
      {photos ? (
        <CardCarousel photos={photos} recordKey={row.key} cover={cover}>
          {card}
        </CardCarousel>
      ) : (
        card(cover)
      )}
    </div>
  )
}
