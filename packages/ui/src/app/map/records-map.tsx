import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import * as maplibre from 'maplibre-gl'
import { Map, Marker, NavigationControl, type MapRef } from 'react-map-gl/maplibre'
import type { MapBounds, MapBucket } from '@protobase/client'
import type { MapView } from '@protobase/schema'
import { cn } from '../../lib/cn'
import { groupPoints, type MapGroup, type MapPoint } from '../displays/map-groups'
import type { MapArea } from './map-area'
import { PositionAreas, type AreaColors } from './position-areas'
import { themeColor } from './theme-color'
// MapLibre's worker and the pmtiles protocol are set up where the record map loads them
import './record-map'

// How close, in pixels, records are drawn under one marker, about a marker's width.
const groupRadius = 28
const fitOptions = { padding: 48, maxZoom: 15, duration: 0 }
// A bucket opens far enough in for the server to send its records: it does from zoom 16 on.
const bucketOptions = { padding: 48, maxZoom: 16, duration: 300 }
const markerHeight = 32
const compact = new Intl.NumberFormat('en-IE', { notation: 'compact', maximumFractionDigits: 1 })

const corners = (bounds: MapBounds): [[number, number], [number, number]] => [
  [bounds.west, bounds.south],
  [bounds.east, bounds.north],
]

type RecordsMapProps = {
  style: string
  /** Where the map looks when it opens; the whole world without it. */
  initial: MapView | undefined
  points: MapPoint[]
  /** Counts of records in parts of the map, drawn as circles in place of their records. */
  buckets: MapBucket[]
  /** Bounds to move the map to, each time they change; `onFitted` says it moved there. */
  fit: MapBounds | undefined
  onFitted: () => void
  /** The map's area and view, each time it comes to rest. */
  onMove: (area: MapArea, view: MapView) => void
  /** The records whose marker is chosen, if any. */
  selected: string[] | undefined
  /** How many pixels at the map's bottom something covers, such as the chosen record's card. */
  covered: number
  onSelect: (keys: string[]) => void
  onClear: () => void
  /** What a marker for these records says to a screen reader. */
  markerLabel: (keys: string[]) => string
  /** What a bucket of this many records says to a screen reader. */
  bucketLabel: (count: number) => string
}

/**
 * A map of `style` with a marker for each group of records that lie close together at the zoom, showing how many it
 * stands for, and a circle with the count of each bucket, which zooms in on its records when chosen. A marker whose
 * records' positions are all approximate is drawn hollow with a dashed edge, over the areas around them. Choosing a
 * marker selects its records; choosing the map elsewhere clears the selection. A chosen marker the covered bottom would
 * hide moves up into the open part of the map.
 */
export const RecordsMap = ({ style, initial, points, buckets, fit, onFitted, onMove, selected, covered, onSelect, onClear, markerLabel, bucketLabel }: RecordsMapProps) => {
  const ref = useRef<MapRef>(null)
  const [groups, setGroups] = useState<MapGroup[]>([])
  const [colors, setColors] = useState<AreaColors>()
  const byKey = new globalThis.Map(points.map((point) => [point.key, point]))
  const pointKeys = points.map((point) => point.key).join(',')
  const fitKey = fit && JSON.stringify(fit)

  // The groups as the map is drawn now: only the zoom changes which records lie close together
  const regroup = () => {
    const map = ref.current?.getMap()
    if (!map) return
    setGroups(
      groupPoints(
        points.map((point) => ({ key: point.key, ...map.project([point.longitude, point.latitude]) })),
        groupRadius,
      ),
    )
  }

  const report = () => {
    const map = ref.current?.getMap()
    if (!map) return
    const bounds = map.getBounds()
    const center = map.getCenter()
    onMove({ bounds: { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() }, zoom: map.getZoom() }, { latitude: center.lat, longitude: center.lng, zoom: map.getZoom() })
  }

  const fitNow = () => {
    const map = ref.current?.getMap()
    if (!map || !fit) return
    map.fitBounds(corners(fit), fitOptions)
    onFitted()
    report()
  }

  // Other records are grouped at the zoom the map is at
  useEffect(regroup, [pointKeys])
  useEffect(fitNow, [fitKey])

  // The chosen marker in view above what covers the map's bottom
  const chosenAt = groups.find((group) => selected !== undefined && group.keys.some((key) => selected.includes(key)))?.at
  useEffect(() => {
    const map = ref.current?.getMap()
    const at = chosenAt === undefined ? undefined : byKey.get(chosenAt)
    if (!map || !at || covered === 0) return
    const { y } = map.project([at.longitude, at.latitude])
    const open = map.getContainer().clientHeight - covered
    if (y > markerHeight && y < open) return
    map.easeTo({ center: [at.longitude, at.latitude], offset: [0, (markerHeight - covered) / 2], duration: 300 })
    // A new choice or a new cover moves the map, not every new group
  }, [chosenAt, covered])

  return (
    <Map
      ref={ref}
      mapLib={maplibre}
      mapStyle={style}
      initialViewState={initial ?? { latitude: 0, longitude: 0, zoom: 1 }}
      style={{ width: '100%', height: '100%' }}
      onLoad={() => {
        const container = ref.current!.getMap().getContainer()
        setColors({ area: themeColor(container, '--primary'), chosen: themeColor(container, '--foreground') })
        regroup()
        if (fit) fitNow()
        else report()
      }}
      onZoomEnd={regroup}
      onMoveEnd={report}
      onClick={onClear}
    >
      <NavigationControl showCompass={false} />
      {colors && <PositionAreas points={points} selected={selected} colors={colors} />}
      {buckets.map((bucket) => (
        <Marker key={`${bucket.latitude},${bucket.longitude}`} latitude={bucket.latitude} longitude={bucket.longitude} anchor="center">
          <button
            type="button"
            aria-label={bucketLabel(bucket.count)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full border-2 border-background bg-primary text-xs font-semibold text-primary-foreground tabular-nums shadow"
            onClick={(event) => {
              event.stopPropagation()
              ref.current?.getMap().fitBounds(corners(bucket.bounds), bucketOptions)
            }}
          >
            {compact.format(bucket.count)}
          </button>
        </Marker>
      ))}
      {groups.map((group) => {
        const at = byKey.get(group.at)
        if (!at) return null
        const chosen = selected !== undefined && group.keys.some((key) => selected.includes(key))
        const approximate = group.keys.every((key) => byKey.get(key)?.approximate)
        return (
          <Marker key={group.at} latitude={at.latitude} longitude={at.longitude} anchor="bottom" style={{ zIndex: chosen ? 1 : 0 }}>
            <button
              type="button"
              aria-label={markerLabel(group.keys)}
              aria-pressed={chosen}
              className="relative block cursor-pointer"
              onClick={(event) => {
                event.stopPropagation()
                onSelect(group.keys)
              }}
            >
              <MapPin
                aria-hidden
                data-approximate={approximate || undefined}
                className={cn('size-8 drop-shadow', approximate ? (chosen ? 'fill-background text-foreground' : 'fill-background text-primary') : chosen ? 'fill-foreground text-background' : 'fill-primary text-primary-foreground')}
                strokeWidth={approximate ? 2 : 1.5}
                strokeDasharray={approximate ? '3 2' : undefined}
              />
              {group.keys.length > 1 && (
                <span className="absolute -right-2 -top-1 min-w-5 rounded-full border border-background bg-foreground px-1 text-center text-[11px] font-medium leading-4 text-background tabular-nums">
                  {group.keys.length}
                </span>
              )}
            </button>
          </Marker>
        )
      })}
    </Map>
  )
}
