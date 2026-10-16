import { MapPin } from 'lucide-react'
import { Map, Marker, NavigationControl } from 'react-map-gl/maplibre'
import type { MapLayerModel } from '@protobase/client'
import { MapLayerSwitch } from './map-layer-switch'
import { mapLib } from './maplibre'
import type { Position } from './record-position'

/**
 * A map of `style` centred on `position` at `zoom`, with a pin on it. It pans and zooms with two fingers on a phone and
 * with Ctrl or Cmd and the wheel, so scrolling the page past it does not move it. With `layers`, it switches to them.
 */
export const RecordMap = ({ style, layers, position, zoom }: { style: string; layers?: MapLayerModel[]; position: Position; zoom: number }) => (
  <Map mapLib={mapLib} mapStyle={style} initialViewState={{ ...position, zoom }} cooperativeGestures style={{ width: '100%', height: '100%' }}>
    <NavigationControl showCompass={false} />
    <MapLayerSwitch layers={layers} />
    <Marker latitude={position.latitude} longitude={position.longitude} anchor="bottom">
      <MapPin aria-hidden className="size-8 fill-primary text-primary-foreground drop-shadow" strokeWidth={1.5} />
    </Marker>
  </Map>
)
