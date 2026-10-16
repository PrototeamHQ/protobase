import { lazy, Suspense } from 'react'
import type { MapSectionModel } from '@protobase/schema'
import { Section, SidebarCard } from '../../record-view'
import { useAdminMeta } from '../meta-gate'
import { recordPosition } from './record-position'

// MapLibre and the tiles' protocol load with the first map drawn, so a page without one never loads them.
const RecordMap = lazy(() => import('./record-map').then((module) => ({ default: module.RecordMap })))

const defaultZoom = 15

/**
 * A map of the record's position (`l.map`), in a section or a sidebar card under its title, drawn with the map style
 * `/meta` names. Without a style, or for a record without a position, there is nothing to draw and no section.
 */
export const MapSection = ({ item, record }: { item: MapSectionModel; record: Record<string, unknown> }) => {
  const maps = useAdminMeta().maps
  const style = maps?.style
  const position = recordPosition(record, item)
  if (!style || !position) return null
  const map = (
    <div className={`overflow-hidden rounded-lg border border-border bg-muted ${item.sidebar ? 'h-48' : 'h-64 md:h-80'}`}>
      <Suspense fallback={null}>
        {/* A new position is a new map, centred on it */}
        <RecordMap key={`${position.latitude},${position.longitude}`} style={style} layers={maps?.layers} position={position} zoom={item.zoom ?? defaultZoom} />
      </Suspense>
    </div>
  )
  return item.sidebar ? <SidebarCard title={item.title}>{map}</SidebarCard> : <Section title={item.title}>{map}</Section>
}
