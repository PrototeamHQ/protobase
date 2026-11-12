// The most pixels one canvas holds: the limit of the browsers with the smallest, Safari on iOS among them.
export const maxCanvasPixels = 2 ** 24

/** How a page `pageWidth` by `pageHeight` points wide is drawn `cssWidth` pixels wide on a `pixelRatio` screen. */
export type PageSize = {
  /** The scale pdf.js draws the page at, CSS pixels per point. */
  scale: number
  /** The page's height on screen, in CSS pixels. */
  cssHeight: number
  /** The canvas's own pixels: the screen's, but no more than `maxCanvasPixels` in all. */
  canvasWidth: number
  canvasHeight: number
  /** Canvas pixels per CSS pixel. */
  pixelRatio: number
}

/** A page drawn to fill `cssWidth`, sharp on the screen's pixels as long as the canvas stays within `maxCanvasPixels`. */
export const pageSize = (pageWidth: number, pageHeight: number, cssWidth: number, pixelRatio: number): PageSize => {
  const scale = cssWidth / pageWidth
  const cssHeight = pageHeight * scale
  const ratio = Math.min(pixelRatio, Math.sqrt(maxCanvasPixels / (cssWidth * cssHeight)))
  return { scale, cssHeight, canvasWidth: Math.floor(cssWidth * ratio), canvasHeight: Math.floor(cssHeight * ratio), pixelRatio: ratio }
}
