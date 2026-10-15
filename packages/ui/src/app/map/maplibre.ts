import * as maplibre from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'

// This module loads the first time a map is drawn, and once: MapLibre runs its worker from the bundled file, as its
// docs say for Vite, and reads `pmtiles://` sources in a style by range requests to the one archive. A map takes
// MapLibre from here, so a build that drops modules imported only for their effects keeps this one.
maplibre.setWorkerUrl(workerUrl)
maplibre.addProtocol('pmtiles', new Protocol().tile)

/** MapLibre, set up to run its worker and read PMTiles archives: what a map draws with. */
export const mapLib = maplibre
