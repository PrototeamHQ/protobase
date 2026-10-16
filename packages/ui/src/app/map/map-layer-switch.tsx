import { useState } from 'react'
import { Layer, Source, useMap } from 'react-map-gl/maplibre'
import type { MapLayerModel } from '@protobase/client'
import { Segmented } from '../../primitives/segmented'
import { chosenMapLayer, readMapLayer, writeMapLayer } from './map-layer-choice'

// The default map's value in the switch: no layer id can be empty.
const styleValue = ''

/**
 * Inside a map, a switch in its top left corner between the style's map and each of `layers`, and the chosen layer's
 * tiles drawn over the style's, under `below` when the map has that layer, such as the areas around records. The
 * layer's credit joins the map's attribution while it shows. Outside its bounds the style's map shows through. The
 * choice is remembered in this browser, for every map. Nothing without layers.
 */
export const MapLayerSwitch = ({ layers, below }: { layers: MapLayerModel[] | undefined; below?: string }) => {
  const [chosenId, setChosenId] = useState(() => readMapLayer(localStorage))
  const { current: map } = useMap()
  if (!layers || layers.length === 0) return null
  const chosen = chosenMapLayer(layers, chosenId)
  const choose = (value: string) => {
    const id = value === styleValue ? undefined : value
    writeMapLayer(localStorage, id)
    setChosenId(id ?? null)
  }
  const beforeId = below && map?.getLayer(below) ? below : undefined
  return (
    <>
      {chosen && (
        <Source key={chosen.id} id={`map-layer-${chosen.id}`} type="raster" tiles={[chosen.tiles]} tileSize={256} attribution={chosen.attribution} maxzoom={chosen.maxzoom ?? 22} {...(chosen.bounds && { bounds: chosen.bounds })}>
          <Layer id={`map-layer-${chosen.id}`} type="raster" {...(beforeId && { beforeId })} />
        </Source>
      )}
      <div className="absolute left-2.5 top-2.5 z-10 rounded-md shadow">
        <Segmented label="Map layer" value={chosen?.id ?? styleValue} onChange={choose} options={[{ value: styleValue, label: 'Map' }, ...layers.map((layer) => ({ value: layer.id, label: layer.label }))]} />
      </div>
    </>
  )
}
