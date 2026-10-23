/**
 * The viewport of the iOS and Android app: as the page's, at a scale of one. Safari on iOS zooms into an input whose
 * text is smaller than 16px when it is focused, and in the app the page then stays zoomed with its right side cut off;
 * an app does not zoom, so its viewport stays at that scale, under a pinch too. The page in a browser keeps its zoom.
 */
export const nativeViewport = (content: string) => {
  const kept = content.split(',').map((part) => part.trim()).filter((part) => part && !/^maximum-scale\s*=/.test(part))
  return [...kept, 'maximum-scale=1'].join(', ')
}

/** Gives the document's viewport the app's scale; a document without a viewport tag needs none. */
export const applyNativeViewport = (doc: Document) => {
  const meta = doc.querySelector('meta[name="viewport"]')
  if (!meta) return
  meta.setAttribute('content', nativeViewport(meta.getAttribute('content') ?? ''))
}
