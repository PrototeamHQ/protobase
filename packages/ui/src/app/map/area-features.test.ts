import { describe, expect, it } from 'vitest'
import { areaFeatures, fadeIn, zoomZeroSpan } from './area-features'
import { circleArea } from './approximate-position'

const at = { latitude: 0, longitude: 0 }
const street = { type: 'LineString' as const, coordinates: [[0, 0], [0.5, 0]] as [number, number][] }

describe('zoomZeroSpan', () => {
  it('measures the larger of the width and height MapLibre draws the area at zoom 0, 512 pixels for the world', () => {
    expect(zoomZeroSpan(street)).toBeCloseTo((0.5 / 360) * 512, 10)
    // On the equator a circle is as tall as it is wide: a 1 km radius is 2 km of the way around the globe
    expect(zoomZeroSpan(circleArea(at, 1000))).toBeCloseTo((2000 / (2 * Math.PI * 6_371_008.8)) * 512, 6)
  })
})

describe('areaFeatures', () => {
  it('holds the areas of the points that have one, the chosen ones last so they are drawn on top', () => {
    const circle = circleArea(at, 100)
    const points = [
      { key: 'a', ...at, approximate: true as const, area: circle },
      { key: 'b', ...at },
      { key: 'c', ...at, approximate: true as const },
      { key: 'd', ...at, approximate: true as const, area: street },
    ]
    const { features } = areaFeatures(points, ['a'])
    expect(features.map((feature) => feature.properties)).toEqual([
      { key: 'd', kind: 'line', span: zoomZeroSpan(street), chosen: false },
      { key: 'a', kind: 'polygon', span: zoomZeroSpan(circle), chosen: true },
    ])
    expect(features[1]!.geometry).toBe(circle)
    expect(areaFeatures(points, undefined).features.map((feature) => feature.properties.key)).toEqual(['a', 'd'])
  })
})

// The arithmetic of a stop's output for a feature of this span, as MapLibre evaluates it.
const evaluate = (expression: unknown, span: number): number => {
  if (typeof expression === 'number') return expression
  const [operator, ...args] = expression as [string, ...unknown[]]
  if (operator === 'get') return span
  const values = args.map((arg) => evaluate(arg, span))
  if (operator === '*') return values[0]! * values[1]!
  if (operator === '/') return values[0]! / values[1]!
  if (operator === '-') return values[0]! - values[1]!
  if (operator === 'min') return Math.min(...values)
  if (operator === 'max') return Math.max(...values)
  throw new Error(`Not an operator of fadeIn: ${operator}`)
}

describe('fadeIn', () => {
  // The opacity an area of this span has at a whole zoom level.
  const opacity = (full: number, span: number, zoom: number) => {
    const stops = (fadeIn(full) as unknown[]).slice(3)
    return evaluate(stops[zoom * 2 + 1], span)
  }

  it('interpolates on the zoom, with a stop at each whole level MapLibre has', () => {
    const expression = fadeIn(0.5) as unknown[]
    expect(expression.slice(0, 3)).toEqual(['interpolate', ['linear'], ['zoom']])
    expect(expression.slice(3).filter((_, index) => index % 2 === 0)).toEqual(Array.from({ length: 23 }, (_, zoom) => zoom))
  })

  it('fades an area in over the zoom levels where it grows from half a marker to a marker and a half across', () => {
    // 1/64 of a pixel at zoom 0 is 16 pixels at zoom 10, 32 at 11 and 64 at 12
    expect(opacity(0.5, 1 / 64, 9)).toBe(0)
    expect(opacity(0.5, 1 / 64, 10)).toBe(0)
    expect(opacity(0.5, 1 / 64, 11)).toBe(0.25)
    expect(opacity(0.5, 1 / 64, 12)).toBe(0.5)
    expect(opacity(0.5, 1 / 64, 22)).toBe(0.5)
  })
})
