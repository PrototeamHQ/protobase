import type { ElkNode } from 'elkjs/lib/elk-api'
import type { GraphLayoutName, GraphShape } from '@protobase/layout'

/** A node's size: room for its label on one or two lines and its status badge, the width a node's own contents get. */
export const nodeSize = { width: 200, height: 64 }

/** The width of a node that draws contents of its own, whose height they decide. */
export const contentWidth = 224

/** A box at its top-left corner, in the graph's own coordinates. */
export type Box = { x: number; y: number; width: number; height: number }

export type Size = { width: number; height: number }

/** Where each group and node of a graph sits, each group a region around its nodes, and the size of the whole. */
export type GraphLayout = { groups: Map<string, Box>; nodes: Map<string, Box>; width: number; height: number }

/** How a graph is laid out: its algorithm, which way a layered one runs, each node's size, and the nodes placed by their records. */
export type LayoutInput = { layout: GraphLayoutName; direction: 'down' | 'right'; sizes: ReadonlyMap<string, Size>; positions: ReadonlyMap<string, { x: number; y: number }> }

// Room in a region around its nodes, more on top for its value
const padding = { top: 32, side: 16, bottom: 16 }
const elkPadding = `[top=${padding.top},left=${padding.side},bottom=${padding.bottom},right=${padding.side}]`

// The space between the nodes the engine lays out and the ones placed above them
const placedGap = 48

const groupId = (id: string) => `group:${id}`
const nodeId = (id: string) => `node:${id}`

const algorithmOptions = (input: LayoutInput): Record<string, string> =>
  input.layout === 'force'
    ? // Its seed is fixed, so the same records always make the same picture
      { 'elk.algorithm': 'force', 'elk.randomSeed': '1', 'elk.spacing.nodeNode': '40' }
    : { 'elk.algorithm': 'layered', 'elk.direction': input.direction === 'right' ? 'RIGHT' : 'DOWN', 'elk.layered.spacing.nodeNodeBetweenLayers': '56', 'elk.spacing.nodeNode': '32' }

/** The nodes the engine places: those without a position of their own. */
const unplaced = (shape: GraphShape, input: LayoutInput) => shape.nodes.filter((node) => !input.positions.has(node.id))

/**
 * The graph ELK lays out: each node without a position as a box of its size, inside a box of its group, and each edge
 * between two of them. A layered graph lays its groups out with the rest (hierarchy INCLUDE_CHILDREN); a force one
 * lays each group out inside its box, then the boxes as nodes. `undefined` when every node has a position.
 */
export const graphElk = (shape: GraphShape, input: LayoutInput): ElkNode | undefined => {
  const nodes = unplaced(shape, input)
  if (nodes.length === 0) return undefined
  const options = algorithmOptions(input)
  const box = (id: string): ElkNode => ({ id: nodeId(id), ...(input.sizes.get(id) ?? nodeSize) })
  const groups = shape.groups.flatMap((group): ElkNode[] => {
    const members = nodes.filter((node) => node.group === group.id)
    return members.length === 0 ? [] : [{ id: groupId(group.id), layoutOptions: { ...options, 'elk.padding': elkPadding }, children: members.map((node) => box(node.id)) }]
  })
  const loose = nodes.filter((node) => node.group === undefined).map((node) => box(node.id))
  const laid = new Set(nodes.map((node) => node.id))
  const edges = shape.edges.filter((edge) => laid.has(edge.source) && laid.has(edge.target) && edge.source !== edge.target).map((edge) => ({ id: `edge:${edge.id}`, sources: [nodeId(edge.source)], targets: [nodeId(edge.target)] }))
  return { id: 'root', layoutOptions: { ...options, ...(input.layout === 'layered' && { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' }) }, children: [...groups, ...loose], edges }
}

const boundsOf = (boxes: Box[]): Box | undefined => {
  if (boxes.length === 0) return undefined
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return { x, y, width: Math.max(...boxes.map((box) => box.x + box.width)) - x, height: Math.max(...boxes.map((box) => box.y + box.height)) - y }
}

/**
 * Where everything sits: each placed node at its position, the nodes the engine laid out (`laidOut`, from `graphElk`)
 * under them, each group a region around its nodes, the whole moved so it starts at 0, 0.
 */
export const placeGraph = (shape: GraphShape, input: LayoutInput, laidOut?: ElkNode): GraphLayout => {
  const placed = new Map<string, Box>()
  for (const node of shape.nodes) {
    const position = input.positions.get(node.id)
    if (position) placed.set(node.id, { ...position, ...(input.sizes.get(node.id) ?? nodeSize) })
  }
  // ELK gives each child its place inside its parent
  const engine = new Map<string, Box>()
  const visit = (parent: ElkNode, x: number, y: number) => {
    for (const child of parent.children ?? []) {
      const at = { x: x + (child.x ?? 0), y: y + (child.y ?? 0) }
      if (child.id.startsWith('node:')) engine.set(child.id.slice('node:'.length), { ...at, width: child.width ?? nodeSize.width, height: child.height ?? nodeSize.height })
      else visit(child, at.x, at.y)
    }
  }
  if (laidOut) visit(laidOut, 0, 0)
  const above = boundsOf([...placed.values()])
  const below = boundsOf([...engine.values()])
  const shift = above && below ? { x: above.x - below.x, y: above.y + above.height + placedGap - below.y } : { x: 0, y: 0 }
  for (const [id, box] of engine) placed.set(id, { ...box, x: box.x + shift.x, y: box.y + shift.y })
  const groups = new Map<string, Box>()
  for (const group of shape.groups) {
    const members = boundsOf(shape.nodes.filter((node) => node.group === group.id && placed.has(node.id)).map((node) => placed.get(node.id)!))
    if (members) groups.set(group.id, { x: members.x - padding.side, y: members.y - padding.top, width: members.width + 2 * padding.side, height: members.height + padding.top + padding.bottom })
  }
  const whole = boundsOf([...placed.values(), ...groups.values()]) ?? { x: 0, y: 0, width: 0, height: 0 }
  const moved = (box: Box): Box => ({ ...box, x: box.x - whole.x, y: box.y - whole.y })
  return {
    nodes: new Map([...placed].map(([id, box]) => [id, moved(box)])),
    groups: new Map([...groups].map(([id, box]) => [id, moved(box)])),
    width: whole.width,
    height: whole.height,
  }
}
