// Drawn icons by their markup, so a tab's icon is drawn once
const drawn = new Map<string, Promise<string | null>>()

/** Pixels a side the icon is drawn at: 24 points at 3x, as the native tab bar takes it. */
const side = 72

/**
 * A tab's SVG icon as a PNG data URL, in black on transparent, for the native tab bar to tint as it does its own; `null`
 * without an icon or where it cannot be drawn.
 */
export const tabIcon = (svg: SVGElement | null): Promise<string | null> => {
  if (!svg) return Promise.resolve(null)
  const copy = svg.cloneNode(true) as SVGElement
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', '24')
  copy.setAttribute('height', '24')
  copy.removeAttribute('class')
  const markup = new XMLSerializer().serializeToString(copy).replaceAll('currentColor', '#000')
  let icon = drawn.get(markup)
  if (!icon) {
    icon = new Promise((resolve) => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = side
        canvas.height = side
        const context = canvas.getContext('2d')
        if (!context) return resolve(null)
        context.drawImage(image, 0, 0, side, side)
        resolve(canvas.toDataURL('image/png'))
      }
      image.onerror = () => resolve(null)
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
    })
    drawn.set(markup, icon)
  }
  return icon
}
