import type { MapLayerModel } from '@protobase/client'
import { guarded } from '../../lib/guarded'

export const mapLayerStorageKey = 'protobase:map-layer'

/** The layer the browser last chose, if the app still offers it: else the style's own map, which is the default. */
export const chosenMapLayer = (layers: MapLayerModel[], id: string | null | undefined) => layers.find((layer) => layer.id === id)

/** The id of the layer chosen in this browser, if any; unavailable storage reads as the default map. */
export const readMapLayer = (storage: Pick<Storage, 'getItem'>) => guarded(() => storage.getItem(mapLayerStorageKey), null)

/** Remembers a layer by its id, and the default map by forgetting the choice, so the default costs no storage. */
export const writeMapLayer = (storage: Pick<Storage, 'setItem' | 'removeItem'>, id: string | undefined) =>
  guarded(() => (id === undefined ? storage.removeItem(mapLayerStorageKey) : storage.setItem(mapLayerStorageKey, id)), undefined)
