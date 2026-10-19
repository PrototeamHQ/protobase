import { pointerWithin, rectIntersection, type ClientRect, type CollisionDetection, type DroppableContainer, type KeyboardCoordinateGetter, type UniqueIdentifier } from '@dnd-kit/core'

/** The id a board's column is dropped on by. */
export const columnId = (value: string | null) => (value === null ? 'none' : `value:${value}`)

// A card of a ranked board, which a card is dropped on to take its place, rather than a column
const isCard = (container: { data: { current?: Record<string, unknown> } }) => container.data.current?.sortable !== undefined

/**
 * A pointer drops a card on the card under it, on a ranked board, else on the column under it; the keyboard, which has
 * no pointer, on what the card overlaps.
 */
export const collision: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  const card = under.find((entry) => entry.data?.droppableContainer && isCard(entry.data.droppableContainer as DroppableContainer))
  if (card) return [card]
  return under.length > 0 ? under : rectIntersection(args)
}

/** The left and right arrow keys move a picked-up card to the top of the next column, onto its first card when it has one. */
export const columnCoordinates: KeyboardCoordinateGetter = (event, { context: { collisionRect, droppableRects, droppableContainers, over } }) => {
  const step = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0
  if (step === 0 || !collisionRect) return undefined
  event.preventDefault()
  const enabled = droppableContainers.getEnabled()
  const columns = enabled
    .filter((container) => !isCard(container))
    .flatMap((container) => {
      const rect = droppableRects.get(container.id)
      return rect ? [{ id: container.id, rect }] : []
    })
    .sort((a, b) => a.rect.left - b.rect.left)
  const center = collisionRect.left + collisionRect.width / 2
  const current = over?.data.current?.sortable?.containerId ?? over?.id
  const at = current !== undefined ? columns.findIndex((column) => column.id === current) : columns.findIndex((column) => column.rect.left <= center && center <= column.rect.right)
  const target = columns[at + step]
  if (at === -1 || !target) return undefined
  const first = cardRects(enabled, droppableRects, target.id)[0]
  return { x: target.rect.left + (target.rect.width - collisionRect.width) / 2, y: first?.rect.top ?? target.rect.top }
}

// The cards of a ranked board's column, top to bottom
const cardRects = (enabled: DroppableContainer[], rects: Map<UniqueIdentifier, ClientRect>, column: UniqueIdentifier) =>
  enabled
    .filter((container) => container.data.current?.sortable?.containerId === column)
    .flatMap((container) => {
      const rect = rects.get(container.id)
      return rect ? [{ id: container.id, rect }] : []
    })
    .sort((a, b) => a.rect.top - b.rect.top)

/**
 * On a ranked board the up and down arrow keys move a picked-up card to the place of the card above or below it in its
 * column; the left and right ones as `columnCoordinates` does. An unranked board has no cards to drop on, so up and down
 * do nothing there.
 */
export const cardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const step = event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0
  if (step === 0) return columnCoordinates(event, args)
  const { droppableRects, droppableContainers, over } = args.context
  const column = over?.data.current?.sortable?.containerId ?? over?.id
  if (column === undefined) return undefined
  const cards = cardRects(droppableContainers.getEnabled(), droppableRects, column)
  // Over the column itself, below its cards, is after the last
  const at = over?.id === column ? cards.length : cards.findIndex((card) => card.id === over?.id)
  const target = cards[at + step]
  if (!target) return undefined
  event.preventDefault()
  return { x: target.rect.left, y: target.rect.top }
}
