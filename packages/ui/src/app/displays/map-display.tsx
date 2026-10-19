import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleDashed, X } from 'lucide-react'
import type { ListDisplayModel, MapView, ResourceModel, ViewModel } from '@protobase/schema'
import { useDebounced } from '../../lib/use-debounced'
import { humanize } from '../../live/naming'
import { cn } from '../../lib/cn'
import { Button } from '../../primitives/button'
import { ErrorBanner } from '../error-banner'
import { boundsAround, worldArea, type MapArea } from '../map/map-area'
import { useAdminMeta } from '../meta-gate'
import { Problem } from '../pages/problem'
import { mapCards } from './list-displays'
import { keptSelection, mapPoints, stepSelection, type MapSelection } from './map-groups'
import { RecordCard } from './record-card'
import { useMapRecords } from './use-map-records'

// MapLibre loads with the first map drawn, so a list that never shows one never loads it.
const RecordsMap = lazy(() => import('../map/records-map').then((module) => ({ default: module.RecordsMap })))

// How long the map stays put before the records where it rests are asked for, so a run of zooms asks once.
const settleMs = 250

type MapProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: Extract<ListDisplayModel, { kind: 'map' }>
  /** The list's filter, its search included, and its order, as the list API takes them. */
  filter: string
  orderBy: string
  /** The fields the records' relations are labelled for, those the card shows among them. */
  fields: string[]
  /** Where the map looks when it opens; without it, it fits every matching record. */
  at?: MapView
  /** Where the map came to rest, for the list's address. */
  onMove?: (view: MapView) => void
  /** How many records are in view, under the map at desktop width; an embedded list, which links to the list instead, leaves it out. */
  footer?: boolean
  /** Below desktop width, fills the page's sides and bottom edge to edge, with no frame. */
  flush?: boolean
}

const arrow = 'flex size-8 items-center justify-center rounded-full border border-border bg-background hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'

/**
 * The matching records in the map's view, drawn with the map style `/meta` names: the records themselves when few are
 * in view or the map is close, else a count for each part of it, which zooms in when chosen. The map asks again as it
 * pans and zooms. Without a view of its own it first fits every matching record. Choosing a marker shows the card of
 * its record at the map's bottom, with arrows through the records the marker stands for; closing it or choosing the map
 * elsewhere clears it. A marker and a card whose record's position is approximate say so.
 */
export const MapDisplay = ({ model, view, display, filter, orderBy, fields, at, onMove, footer = true, flush = false }: MapProps) => {
  const maps = useAdminMeta().maps
  const style = maps?.style
  const [chosen, setChosen] = useState<MapSelection>()
  const [area, setArea] = useState<MapArea>()
  const settled = useDebounced(area, settleMs)
  // Without a view, the whole world is asked for, and the map fits what it holds
  const [fitting, setFitting] = useState(at === undefined)
  const records = useMapRecords({ model, view, display, fields, filter, orderBy, area: fitting ? worldArea : settled })
  const loaded = records.isPlaceholderData ? undefined : records.data
  const rows = records.data?.rows ?? []
  const buckets = records.data?.buckets ?? []
  const points = mapPoints(rows, display)
  const fit = fitting && loaded ? boundsAround(mapPoints(loaded.rows, display), loaded.buckets) : undefined

  const cards = mapCards(view, display)
  const plural = (view?.names?.plural ?? humanize(model.name)).toLowerCase()
  const singular = (view?.names?.singular ?? humanize(model.name)).toLowerCase()
  const selection = keptSelection(chosen, rows)
  const row = selection && rows.find((candidate) => candidate.key === selection.keys[selection.index])
  const approximate = new Set(points.filter((point) => point.approximate).map((point) => point.key))
  const markerLabel = (keys: string[]) => {
    const near = keys.filter((key) => approximate.has(key)).length
    if (keys.length === 1) return near === 1 ? `Show the ${singular}, at an approximate position` : `Show the ${singular}`
    if (near === 0) return `Show ${keys.length} ${plural}`
    return near === keys.length ? `Show ${keys.length} ${plural}, at approximate positions` : `Show ${keys.length} ${plural}, ${near} at approximate positions`
  }
  const bucketLabel = (count: number) => `Zoom in on ${count.toLocaleString('en-IE')} ${count === 1 ? singular : plural}`
  // How much of the map's bottom the card and its arrows cover, so the map keeps the chosen marker above them
  const overlay = useRef<HTMLDivElement>(null)
  const [covered, setCovered] = useState(0)
  useLayoutEffect(() => setCovered(overlay.current?.offsetHeight ?? 0), [row?.key])

  if (!style) return <Problem>The map display needs a map style: set PROTOBASE_MAP_STYLE_URL.</Problem>
  const empty = loaded?.total === 0
  return (
    <div className={cn('flex h-full min-h-[36rem] flex-1 flex-col sm:min-h-[28rem]', flush && 'max-md:-mx-5 max-md:-mb-4 max-md:min-h-0')}>
      <div className={cn('relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted', flush && 'max-md:rounded-none max-md:border-0')}>
        <Suspense fallback={null}>
          <RecordsMap
            style={style}
            layers={maps?.layers}
            initial={at}
            points={points}
            buckets={buckets}
            fit={fit}
            onFitted={() => setFitting(false)}
            onMove={(next, center) => {
              setArea(next)
              onMove?.(center)
            }}
            selected={selection?.keys}
            covered={selection ? covered : 0}
            onSelect={(keys) => setChosen({ keys, index: 0 })}
            onClear={() => setChosen(undefined)}
            markerLabel={markerLabel}
            bucketLabel={bucketLabel}
          />
        </Suspense>
        {records.error && (
          <div className="absolute inset-x-3 top-3 z-10">
            <ErrorBanner title="Could not load rows" error={records.error} />
          </div>
        )}
        {empty && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
            <p className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-background px-4 py-1.5 text-muted-foreground shadow" role="status">
              {fitting ? `No ${plural} match.` : `No ${plural} in this part of the map.`}
              {!fitting && (
                <Button size="sm" onClick={() => setFitting(true)}>
                  Show all
                </Button>
              )}
            </p>
          </div>
        )}
        {selection && row && (
          <div ref={overlay} className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center">
            <div className="pointer-events-auto flex w-full max-w-[16rem] flex-col gap-2 sm:max-w-xs" role="group" aria-label={`Chosen ${singular}`}>
              <div className="flex items-center justify-end gap-1.5">
                {approximate.has(row.key) && (
                  <span className="mr-auto flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs">
                    <CircleDashed className="size-3.5" aria-hidden />
                    Approximate position
                  </span>
                )}
                {selection.keys.length > 1 && (
                  <>
                    <button type="button" aria-label="Previous" className={arrow} onClick={() => setChosen(stepSelection(selection, -1))}>
                      <ChevronLeft className="size-4" aria-hidden />
                    </button>
                    <span className="rounded-full border border-border bg-background px-2 py-1 text-xs tabular-nums" aria-live="polite">
                      {selection.index + 1} / {selection.keys.length}
                    </span>
                    <button type="button" aria-label="Next" className={arrow} onClick={() => setChosen(stepSelection(selection, 1))}>
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </>
                )}
                <button type="button" aria-label="Close" className={arrow} onClick={() => setChosen(undefined)}>
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <div className="shadow-lg">
                <RecordCard model={model} view={view} display={cards} row={row} />
              </div>
            </div>
          </div>
        )}
      </div>
      {footer && <p className="hidden py-3 text-xs text-muted-foreground md:block">{inView(records.data, plural)}</p>}
    </div>
  )
}

/** How many of the matching records are in view, and how many the map shows when it cannot show them all. */
const inView = (data: { rows: unknown[]; buckets: unknown[]; total: number } | undefined, plural: string) => {
  if (!data) return ' '
  const total = data.total.toLocaleString('en-IE')
  if (data.buckets.length === 0 && data.rows.length < data.total) return `${data.rows.length.toLocaleString('en-IE')} of ${total} ${plural} in view`
  return `${total} ${plural} in view`
}
