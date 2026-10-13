import { recordPosition, type Position } from '../map/record-position'
import type { ListDisplayRow } from './list-displays'

/** A record on a map display: its key and its position. */
export type MapPoint = Position & { key: string }

/** A point as the map draws it, in pixels from the map's corner. */
export type ScreenPoint = { key: string; x: number; y: number }

/** The records a map marker stands for, by their keys, at the position of the first. */
export type MapGroup = { keys: string[]; at: string }

/** The rows with a position, in their order; a row without one is not on the map. */
export const mapPoints = (rows: ListDisplayRow[], fields: { latitude: string; longitude: string }): MapPoint[] =>
  rows.flatMap((row) => {
    const position = recordPosition(row.record, fields)
    return position ? [{ key: row.key, ...position }] : []
  })

/** The south-west and north-east corners around the points, as `[longitude, latitude]`, or none without points. */
export const pointBounds = (points: Position[]): [[number, number], [number, number]] | undefined => {
  if (points.length === 0) return undefined
  const longitudes = points.map((point) => point.longitude)
  const latitudes = points.map((point) => point.latitude)
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ]
}

/**
 * The markers for the points as the map draws them: in order, each point joins the first marker within `radius` pixels
 * of it, else starts its own. A marker is at its first point, so markers do not move as others join them.
 */
export const groupPoints = (points: ScreenPoint[], radius: number): MapGroup[] => {
  const groups: { at: ScreenPoint; keys: string[] }[] = []
  for (const point of points) {
    const near = groups.find((group) => Math.hypot(group.at.x - point.x, group.at.y - point.y) <= radius)
    if (near) near.keys.push(point.key)
    else groups.push({ at: point, keys: [point.key] })
  }
  return groups.map((group) => ({ keys: group.keys, at: group.at.key }))
}

/** A choice of records on the map, and which of them shows its card; none once the list no longer has any of them. */
export type MapSelection = { keys: string[]; index: number }

/** The selection kept to the records the list still has, its card the same record when it is still there. */
export const keptSelection = (selection: MapSelection | undefined, rows: ListDisplayRow[]): MapSelection | undefined => {
  if (!selection) return undefined
  const present = new Set(rows.map((row) => row.key))
  const keys = selection.keys.filter((key) => present.has(key))
  if (keys.length === 0) return undefined
  const index = keys.indexOf(selection.keys[selection.index]!)
  return { keys, index: Math.max(index, 0) }
}

/** The selection moved by `step` records, round from the last to the first. */
export const stepSelection = (selection: MapSelection, step: number): MapSelection => ({
  keys: selection.keys,
  index: (((selection.index + step) % selection.keys.length) + selection.keys.length) % selection.keys.length,
})
