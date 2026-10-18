import type { KeyboardCoordinateGetter } from '@dnd-kit/core'
import { addDays } from './calendar-range'

const dayPrefix = 'day:'

/** The id a calendar's day is dropped on by. */
export const dayId = (day: string) => `${dayPrefix}${day}`

/** The id of an event on one of its days: a record over several days shows on each. */
export const eventId = (key: string, day: string) => `${key}@${day}`

/** The arrow keys move a picked-up event a day back or on (left and right) or a week (up and down), to that day's top. */
export const dayCoordinates: KeyboardCoordinateGetter = (event, { context: { active, collisionRect, droppableRects, over } }) => {
  const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const step = steps[event.code]
  const day = over ? String(over.id).slice(dayPrefix.length) : (active?.data.current?.day as string | undefined)
  if (step === undefined || !collisionRect || day === undefined) return undefined
  event.preventDefault()
  const target = droppableRects.get(dayId(addDays(day, step)))
  if (!target) return undefined
  return { x: target.left + (target.width - collisionRect.width) / 2, y: target.top + 4 }
}
