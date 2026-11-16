import type { BrowserContext } from 'playwright'

type Rgb = [number, number, number]

/**
 * A frame the page painted: when, in milliseconds after the navigation's commit, the colours of its four corners, and
 * whether anything is drawn around its centre.
 */
export type Frame = { at: number; corners: Rgb[]; markedCentre: boolean }

type TraceEvent = { name: string; ts: number; args?: { snapshot?: string } }

// How far in from the edges the corners are read, past the JPEG's blur at the border
const inset = 4
// The square around the centre that a spinner draws in, and how far from the background its pixels may stray
const centre = 24
const tolerance = 24

/**
 * The frames of a trace that Playwright's `browser.startTracing` recorded with screenshots, from the navigated page's first
 * paint on, so the page the browser showed before it is left out. They are read in a blank page of `context`.
 */
export const framesFrom = async (trace: Buffer, context: BrowserContext): Promise<Frame[]> => {
  const events = (JSON.parse(trace.toString()) as { traceEvents: TraceEvent[] }).traceEvents
  // A frame of the page shown before can still arrive just after the commit, so the frames start at the first paint
  const commit = Math.max(...events.filter((event) => event.name === 'CommitLoad').map((event) => event.ts))
  const firstPaint = Math.min(...events.filter((event) => event.name === 'firstPaint' && event.ts >= commit).map((event) => event.ts))
  const shots = events.filter((event) => event.name === 'Screenshot' && event.ts >= firstPaint).sort((a, b) => a.ts - b.ts)
  const reader = await context.newPage()
  const frames = await reader.evaluate(
    async ({ images, inset, centre, tolerance }) => {
      const read = async (image: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${image}`)).blob())
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')!
        context.drawImage(bitmap, 0, 0)
        const at = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3)) as [number, number, number]
        const right = bitmap.width - 1 - inset
        const bottom = bitmap.height - 1 - inset
        const corners = [at(inset, inset), at(right, inset), at(inset, bottom), at(right, bottom)]
        const [r, g, b] = corners[0]!
        const area = context.getImageData(Math.round((bitmap.width - centre) / 2), Math.round((bitmap.height - centre) / 2), centre, centre).data
        let markedCentre = false
        for (let index = 0; index < area.length; index += 4) {
          if (Math.abs(area[index]! - r) + Math.abs(area[index + 1]! - g) + Math.abs(area[index + 2]! - b) > tolerance) markedCentre = true
        }
        return { corners, markedCentre }
      }
      const frames = []
      for (const image of images) frames.push(await read(image))
      return frames
    },
    { images: shots.map((shot) => shot.args!.snapshot!), inset, centre, tolerance },
  )
  await reader.close()
  return frames.map((frame, index) => ({ at: (shots[index]!.ts - commit) / 1000, ...frame }))
}
