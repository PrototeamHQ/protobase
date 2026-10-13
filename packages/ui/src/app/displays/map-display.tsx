import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { useAdminMeta } from '../meta-gate'
import { Problem } from '../pages/problem'
import type { ListDisplay } from './display-context'
import { DisplayFooter, DisplayState } from './display-frame'
import { mapCards } from './list-displays'
import { keptSelection, mapPoints, stepSelection, type MapSelection } from './map-groups'
import { RecordCard } from './record-card'

// MapLibre loads with the first map drawn, so a list that never shows one never loads it.
const RecordsMap = lazy(() => import('../map/records-map').then((module) => ({ default: module.RecordsMap })))

type MapProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: Extract<ListDisplayModel, { kind: 'map' }>
  list: ListDisplay
  /** How many are on the map and a button for more, under it; an embedded list, which links to the list instead, leaves it out. */
  footer?: boolean
}

const arrow = 'flex size-8 items-center justify-center rounded-full border border-border bg-background hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'

/**
 * The list's loaded records on a map, drawn with the map style `/meta` names. Choosing a marker shows the card of its
 * record at the map's bottom, with arrows through the records the marker stands for; closing it or choosing the map
 * elsewhere clears it. Below the map, how many of the matching records are on it and a button for more.
 */
export const MapDisplay = ({ model, view, display, list, footer = true }: MapProps) => {
  const style = useAdminMeta().maps?.style
  const [chosen, setChosen] = useState<MapSelection>()
  const cards = mapCards(view, display)
  const plural = (view?.names?.plural ?? humanize(model.name)).toLowerCase()
  const selection = keptSelection(chosen, list.rows)
  const row = selection && list.rows.find((candidate) => candidate.key === selection.keys[selection.index])
  const singular = (view?.names?.singular ?? humanize(model.name)).toLowerCase()
  const markerLabel = (keys: string[]) => (keys.length === 1 ? `Show the ${singular}` : `Show ${keys.length} ${plural}`)
  // How much of the map's bottom the card and its arrows cover, so the map keeps the chosen marker above them
  const overlay = useRef<HTMLDivElement>(null)
  const [covered, setCovered] = useState(0)
  useLayoutEffect(() => setCovered(overlay.current?.offsetHeight ?? 0), [row?.key])

  if (!style) return <Problem>The map display needs a map style: set PROTOBASE_MAP_STYLE_URL.</Problem>
  return (
    <DisplayState list={list} empty={`No ${plural} match.`} loading={<Skeleton className="h-96" />}>
      <div className="flex h-full min-h-[36rem] flex-col sm:min-h-[28rem]">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted">
          <Suspense fallback={null}>
            <RecordsMap
              style={style}
              points={mapPoints(list.rows, display)}
              selected={selection?.keys}
              covered={selection ? covered : 0}
              onSelect={(keys) => setChosen({ keys, index: 0 })}
              onClear={() => setChosen(undefined)}
              markerLabel={markerLabel}
            />
          </Suspense>
          {selection && row && (
            <div ref={overlay} className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center">
              <div className="pointer-events-auto flex w-full max-w-[16rem] flex-col gap-2 sm:max-w-xs" role="group" aria-label={`Chosen ${singular}`}>
                <div className="flex items-center justify-end gap-1.5">
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
        {footer && <DisplayFooter list={list} />}
      </div>
    </DisplayState>
  )
}
