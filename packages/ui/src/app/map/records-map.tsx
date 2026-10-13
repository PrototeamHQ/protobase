import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import * as maplibre from 'maplibre-gl'
import { Map, Marker, NavigationControl, type MapRef } from 'react-map-gl/maplibre'
import { cn } from '../../lib/cn'
import { groupPoints, pointBounds, type MapGroup, type MapPoint } from '../displays/map-groups'
// MapLibre's worker and the pmtiles protocol are set up where the record map loads them
import './record-map'

// How close, in pixels, records are drawn under one marker, about a marker's width.
const groupRadius = 28
const fitOptions = { padding: 48, maxZoom: 15, duration: 0 }
const markerHeight = 32

type RecordsMapProps = {
  style: string
  points: MapPoint[]
  /** The records whose marker is chosen, if any. */
  selected: string[] | undefined
  /** How many pixels at the map's bottom something covers, such as the chosen record's card. */
  covered: number
  onSelect: (keys: string[]) => void
  onClear: () => void
  /** What a marker for these records says to a screen reader. */
  markerLabel: (keys: string[]) => string
}

/**
 * A map of `style` with a marker for each group of records that lie close together at the zoom, showing how many it
 * stands for. It fits the records when they change. Choosing a marker selects its records; choosing the map elsewhere
 * clears the selection. A chosen marker the covered bottom would hide moves up into the open part of the map.
 */
export const RecordsMap = ({ style, points, selected, covered, onSelect, onClear, markerLabel }: RecordsMapProps) => {
  const ref = useRef<MapRef>(null)
  const [groups, setGroups] = useState<MapGroup[]>([])
  const byKey = new globalThis.Map(points.map((point) => [point.key, point]))
  const pointKeys = points.map((point) => point.key).join(',')
  const bounds = pointBounds(points)

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

  // Other records are a new view of the map: fit them, then group them at the zoom that gives
  useEffect(() => {
    const map = ref.current?.getMap()
    if (!map) return
    if (bounds) map.fitBounds(bounds, fitOptions)
    regroup()
    // The keys stand for the points and their bounds
  }, [pointKeys])

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
      initialViewState={bounds ? { bounds, fitBoundsOptions: fitOptions } : { latitude: 0, longitude: 0, zoom: 1 }}
      style={{ width: '100%', height: '100%' }}
      onLoad={regroup}
      onZoomEnd={regroup}
      onClick={onClear}
    >
      <NavigationControl showCompass={false} />
      {groups.map((group) => {
        const at = byKey.get(group.at)
        if (!at) return null
        const chosen = selected !== undefined && group.keys.some((key) => selected.includes(key))
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
              <MapPin aria-hidden className={cn('size-8 drop-shadow', chosen ? 'fill-foreground text-background' : 'fill-primary text-primary-foreground')} strokeWidth={1.5} />
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
