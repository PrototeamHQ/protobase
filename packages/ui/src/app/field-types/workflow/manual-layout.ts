import { splitPath, triggerId } from './definition'
import type { Box } from './graph-layout'
import type { PureNode } from './pins/data-graph'

/** Where a node's top left corner is, within the Map or Block it is inside or else the canvas. */
export type Point = { x: number; y: number }

/**
 * Where nodes were moved by hand, by their layout keys, as a workflow's `layout` field keeps them for everyone who edits
 * it: ELK lays out every node it does not name.
 */
export type ManualLayout = Readonly<Record<string, Point>>

/** The key of the trigger's node, and before the fields of the run's input that Break nodes take apart; no state's name. */
export const triggerLayoutKey = '$trigger'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isPoint = (value: unknown): value is Point => isObject(value) && Number.isFinite(value.x) && Number.isFinite(value.y)

/**
 * The layout a workflow's field holds, as its value or the JSON text a draft keeps it as: each position with a finite
 * `x` and `y`, read as those two alone, and nothing of what else it holds.
 */
export const manualLayoutOf = (value: unknown): ManualLayout => {
  let given = value
  if (typeof value === 'string') {
    try {
      given = JSON.parse(value)
    } catch {
      return {}
    }
  }
  if (!isObject(given)) return {}
  return Object.fromEntries(Object.entries(given).flatMap(([key, point]) => (isPoint(point) ? [[key, { x: point.x, y: point.y }]] : [])))
}

// A node's part of a key: a state's name, which is unique across the workflow, or the trigger's key
const nameOf = (id: string) => (id === triggerId ? triggerLayoutKey : splitPath(id).name)

/**
 * The key a node's position is kept under: a state's name, the trigger's key, a Break's the value it takes apart, such
 * as `Save.record`, and a Make's the argument it builds, such as `Save.Arguments.data`. Every key but the trigger's
 * starts with the name of its state, so a save drops those of a state removed.
 */
export const layoutKey = (id: string, pure?: PureNode) => {
  if (pure?.kind === 'break') return [nameOf(pure.source), ...pure.path].join('.')
  if (pure?.kind === 'make') return [nameOf(pure.target), 'Arguments', pure.key].join('.')
  return nameOf(id)
}

/** The layout without a node's position, which ELK then lays out again. */
export const withoutKey = (layout: ManualLayout, key: string): ManualLayout => Object.fromEntries(Object.entries(layout).filter(([other]) => other !== key))

// As ELK spaces nodes, and pads a Map or Block on its right and below
const spacing = 32
const padding = { right: 24, bottom: 24 }

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * The boxes ELK laid out, with the nodes moved by hand at their places: within each Map or Block, and on the canvas, a
 * node ELK laid out over one that was moved, or over a Map grown around it, goes down below it, and a Map or Block grows
 * around what was moved inside it. Without a node moved, ELK's boxes as they are.
 */
export const placedBoxes = (laidOut: ReadonlyMap<string, Box>, moved: ReadonlyMap<string, Point>, parentOf: (id: string) => string | undefined): ReadonlyMap<string, Box> => {
  if (![...moved.keys()].some((id) => laidOut.has(id))) return laidOut
  const boxes = new Map([...laidOut].map(([id, box]) => [id, { ...box, ...moved.get(id) }]))
  const children = new Map<string | undefined, string[]>()
  for (const id of boxes.keys()) children.set(parentOf(id), [...(children.get(parentOf(id)) ?? []), id])
  const depth = (parent: string | undefined): number => (parent === undefined ? 0 : depth(parentOf(parent)) + 1)
  const grown = new Set<string>()
  // The innermost first, so a Map grown inside another is placed at its new size
  for (const parent of [...children.keys()].sort((a, b) => depth(b) - depth(a))) {
    const ids = children.get(parent)!
    if (ids.some((id) => moved.has(id) || grown.has(id))) {
      const placed = ids.filter((id) => moved.has(id)).map((id) => boxes.get(id)!)
      const others = ids.filter((id) => !moved.has(id)).map((id) => boxes.get(id)!).sort((a, b) => a.y - b.y || a.x - b.x)
      for (const box of others) {
        let under = placed.find((other) => overlaps(box, other))
        while (under) {
          box.y = under.y + under.height + spacing
          under = placed.find((other) => overlaps(box, other))
        }
        placed.push(box)
      }
    }
    const group = parent === undefined ? undefined : boxes.get(parent)
    if (!group) continue
    const width = Math.max(group.width, ...ids.map((id) => boxes.get(id)!).map((box) => box.x + box.width + padding.right))
    const height = Math.max(group.height, ...ids.map((id) => boxes.get(id)!).map((box) => box.y + box.height + padding.bottom))
    if (width === group.width && height === group.height) continue
    Object.assign(group, { width, height })
    grown.add(parent!)
  }
  return boxes
}
