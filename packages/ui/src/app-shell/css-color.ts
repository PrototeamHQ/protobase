/**
 * `color`, any colour CSS takes (`oklch()` included), as `#rrggbbaa`, by painting it on a one-pixel canvas; `null` where
 * there is no canvas to paint on.
 */
export const hexColor = (color: string) => {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b, a].map((part) => (part ?? 0).toString(16).padStart(2, '0')).join('')}`
}
