/**
 * The colour a theme token such as `--primary` holds where `element` is, as `rgba()`, which MapLibre's paint reads
 * whatever the theme writes it in: the browser resolves the token, and a pixel painted with it gives its channels.
 */
export const themeColor = (element: HTMLElement, token: string) => {
  const probe = document.createElement('span')
  probe.style.color = `var(${token})`
  element.append(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return resolved
  context.fillStyle = resolved
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
  return `rgba(${red}, ${green}, ${blue}, ${alpha! / 255})`
}
