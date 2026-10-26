export type Rgb = readonly [number, number, number]

/** A plain raster to draw the seed's pictures on: rectangles, polygons and circles in solid colours. */
export const createCanvas = (width: number, height: number) => {
  const pixels = new Uint8Array(width * height * 3)
  const set = (x: number, y: number, [r, g, b]: Rgb) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const at = (y * width + x) * 3
    pixels[at] = r
    pixels[at + 1] = g
    pixels[at + 2] = b
  }
  const rect = (x: number, y: number, w: number, h: number, color: Rgb) => {
    for (let row = Math.max(0, Math.round(y)); row < Math.min(height, Math.round(y + h)); row++) {
      for (let col = Math.max(0, Math.round(x)); col < Math.min(width, Math.round(x + w)); col++) set(col, row, color)
    }
  }
  // Even-odd scanline fill.
  const polygon = (points: ReadonlyArray<readonly [number, number]>, color: Rgb) => {
    const ys = points.map(([, y]) => y)
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(height - 1, Math.ceil(Math.max(...ys))); y++) {
      const crossings: number[] = []
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i]!
        const [x2, y2] = points[(i + 1) % points.length]!
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
      }
      crossings.sort((a, b) => a - b)
      for (let i = 0; i + 1 < crossings.length; i += 2) rect(crossings[i]!, y, crossings[i + 1]! - crossings[i]!, 1, color)
    }
  }
  const circle = (cx: number, cy: number, radius: number, color: Rgb) => {
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
      const half = Math.sqrt(Math.max(0, radius * radius - (y - cy) ** 2))
      rect(cx - half, y, half * 2, 1, color)
    }
  }
  // Top to bottom, from one colour to the other.
  const gradient = (y: number, h: number, from: Rgb, to: Rgb) => {
    for (let row = 0; row < h; row++) {
      const t = row / Math.max(1, h - 1)
      rect(0, y + row, width, 1, [0, 1, 2].map((i) => Math.round(from[i]! + (to[i]! - from[i]!) * t)) as unknown as Rgb)
    }
  }
  return { width, height, pixels, rect, polygon, circle, gradient }
}

export type Canvas = ReturnType<typeof createCanvas>
