import { MapPin } from 'lucide-react'
import * as maplibre from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { Map, Marker, NavigationControl } from 'react-map-gl/maplibre'
import type { Position } from './record-position'

// This module loads the first time a map is drawn, and once: MapLibre runs its worker from the bundled file, as its
// docs say for Vite, and reads `pmtiles://` sources in a style by range requests to the one archive.
maplibre.setWorkerUrl(workerUrl)
maplibre.addProtocol('pmtiles', new Protocol().tile)

/**
 * A map of `style` centred on `position` at `zoom`, with a pin on it. It pans and zooms with two fingers on a phone and
 * with Ctrl or Cmd and the wheel, so scrolling the page past it does not move it.
 */
export const RecordMap = ({ style, position, zoom }: { style: string; position: Position; zoom: number }) => (
  <Map mapLib={maplibre} mapStyle={style} initialViewState={{ ...position, zoom }} cooperativeGestures style={{ width: '100%', height: '100%' }}>
    <NavigationControl showCompass={false} />
    <Marker latitude={position.latitude} longitude={position.longitude} anchor="bottom">
      <MapPin aria-hidden className="size-8 fill-primary text-primary-foreground drop-shadow" strokeWidth={1.5} />
    </Marker>
  </Map>
)
