/**
 * A PNG `width` by `height` pixels of four coloured bands, as a `data:` URL drawn in the browser: a fixture for the
 * stories, large enough to be fitted to the page, so no binary file is checked in.
 */
export const sampleImage = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const bands = ['#2563eb', '#10b981', '#f59e0b', '#ef4444']
  bands.forEach((color, index) => {
    context.fillStyle = color
    context.fillRect((index * width) / bands.length, 0, width / bands.length, height)
  })
  return canvas.toDataURL('image/png')
}
