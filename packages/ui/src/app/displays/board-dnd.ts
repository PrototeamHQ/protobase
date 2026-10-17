import { pointerWithin, rectIntersection, type CollisionDetection, type KeyboardCoordinateGetter } from '@dnd-kit/core'

/** The id a board's column is dropped on by. */
export const columnId = (value: string | null) => (value === null ? 'none' : `value:${value}`)

/** A pointer drops a card on the column under it; the keyboard, which has no pointer, on the column the card overlaps. */
export const collision: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  return under.length > 0 ? under : rectIntersection(args)
}

/** The arrow keys move a picked-up card to the top of the next column to the left or right. */
export const columnCoordinates: KeyboardCoordinateGetter = (event, { context: { collisionRect, droppableRects, droppableContainers, over } }) => {
  const step = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0
  if (step === 0 || !collisionRect) return undefined
  event.preventDefault()
  const columns = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id)
      return rect ? [{ id: container.id, rect }] : []
    })
    .sort((a, b) => a.rect.left - b.rect.left)
  const center = collisionRect.left + collisionRect.width / 2
  const at = over ? columns.findIndex((column) => column.id === over.id) : columns.findIndex((column) => column.rect.left <= center && center <= column.rect.right)
  const target = columns[at + step]
  if (at === -1 || !target) return undefined
  return { x: target.rect.left + (target.rect.width - collisionRect.width) / 2, y: target.rect.top }
}
