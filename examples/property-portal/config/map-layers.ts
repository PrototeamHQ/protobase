import type { MapLayer } from '@protobase/server'

// The aerial photos the maps' switch offers, both open data under CC BY 4.0, free and without a key. Each covers its
// own country; elsewhere the default map shows through. The URLs and terms are in the README's map section.
export const mapLayers: MapLayer[] = [
  {
    id: 'aerial_nl',
    label: 'Aerial (NL)',
    tiles: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
    attribution: 'Luchtfoto <a href="https://www.beeldmateriaal.nl/">Beeldmateriaal Nederland</a>, CC BY 4.0, via <a href="https://www.pdok.nl/">PDOK</a>',
    bounds: [3.2, 50.7, 7.3, 53.7],
    maxzoom: 21,
  },
  {
    id: 'aerial_es',
    label: 'Aerial (ES)',
    tiles: 'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}',
    attribution: '<a href="https://www.scne.es/">PNOA CC BY 4.0 scne.es</a>',
    bounds: [-18.4, 27.5, 4.6, 44.0],
    maxzoom: 20,
  },
]
