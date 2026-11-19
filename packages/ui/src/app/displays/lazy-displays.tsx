import { Skeleton } from '../../primitives/skeleton'
import { lazyComponent } from '../lazy-component'

// The list displays that draw with libraries of their own, such as the board's dragging, load with the first one shown.

const area = () => <Skeleton className="min-h-60 flex-1 rounded-lg" />

export const BoardDisplay = lazyComponent(() => import('./board-display').then((module) => module.BoardDisplay), area)
export const CalendarDisplay = lazyComponent(() => import('./calendar-display').then((module) => module.CalendarDisplay), area)
export const TimelineDisplay = lazyComponent(() => import('./timeline-display').then((module) => module.TimelineDisplay), area)
