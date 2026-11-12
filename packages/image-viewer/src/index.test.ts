import { describe, expect, it } from 'vitest'
import imageViewer, { ImageViewer } from './index'

describe('the image viewer plugin', () => {
  it('opens the raster images downloads serve inline, and neither SVG nor PDF', () => {
    expect(imageViewer.name).toBe('image-viewer')
    expect(Object.keys(imageViewer.fileViewers ?? {}).sort()).toEqual(['image/avif', 'image/bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'])
    expect(Object.values(imageViewer.fileViewers ?? {}).every((viewer) => viewer.component === ImageViewer)).toBe(true)
  })
})
