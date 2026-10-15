import { isApproximate, positionArea, type ApproximateFields, type AreaGeometry } from '../map/approximate-position'
import { recordPosition, type Position } from '../map/record-position'
import type { ListDisplayRow } from './list-displays'

/** A record on a map display: its key, its position, whether that is approximate, and the area drawn around it if so. */
export type MapPoint = Position & { key: string; approximate?: true; area?: AreaGeometry }

/** A point as the map draws it, in pixels from the map's corner. */
export type ScreenPoint = { key: string; x: number; y: number }

/** The records a map marker stands for, by their keys, at the position of the first. */
export type MapGroup = { keys: string[]; at: string }

/** The rows with a position, in their order, approximate ones marked with their area; a row without one is not on the map. */
export const mapPoints = (rows: ListDisplayRow[], fields: { latitude: string; longitude: string } & ApproximateFields): MapPoint[] =>
  rows.flatMap((row) => {
    const position = recordPosition(row.record, fields)
    if (!position) return []
    if (!isApproximate(row.record, fields)) return [{ key: row.key, ...position }]
    const area = positionArea(row.record, fields, position)
    return [{ key: row.key, ...position, approximate: true as const, ...(area && { area }) }]
  })

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
