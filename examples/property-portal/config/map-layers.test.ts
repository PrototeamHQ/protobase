import { mapSettings } from '@protobase/server'
import { describe, expect, it } from 'vitest'
import { mapLayers } from './map-layers'

describe('the aerial photo layers', () => {
  it('pass the checks the server makes at startup, and /meta names them beside the style', () => {
    const settings = mapSettings({ layers: mapLayers }, { PROTOBASE_MAP_STYLE_URL: 'http://localhost:8790/style.json' })
    expect(settings?.layers?.map((layer) => [layer.id, layer.label])).toEqual([['aerial_nl', 'Aerial (NL)'], ['aerial_es', 'Aerial (ES)']])
  })

  it('credit each source as its CC BY 4.0 licence asks', () => {
    expect(mapLayers.map((layer) => layer.attribution)).toEqual([expect.stringContaining('Beeldmateriaal Nederland</a>, CC BY 4.0'), expect.stringContaining('PNOA CC BY 4.0 scne.es')])
  })
})
