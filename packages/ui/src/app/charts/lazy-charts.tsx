import { Skeleton } from '../../primitives/skeleton'
import { lazyComponent } from '../lazy-component'

// The charts' drawing, the charting library and all, loads with the first chart shown, in a skeleton of its size.

export const PeriodChart = lazyComponent(
  () => import('./period-chart').then((module) => module.PeriodChart),
  ({ compact }) => <Skeleton className={compact ? 'h-24 w-full' : 'h-40 w-full'} />,
)

export const GroupDonut = lazyComponent(
  () => import('./group-donut').then((module) => module.GroupDonut),
  () => <Skeleton className="size-36 rounded-full" />,
)
