import { lazy, Suspense, type ComponentType } from 'react'
import { CustomBoundary } from './pages/custom-boundary'

// Its own chunk, so an app without the bell loads nothing of it
const NotificationBell = lazy(() => import('../notifications/bell/notification-bell').then((module) => ({ default: module.NotificationBell })))

/** The top bar's notification bell, or the project's or a plugin's `shell.bell` in its place. */
export const ShellBell = ({ own: Own }: { own: ComponentType | undefined }) =>
  Own ? (
    <CustomBoundary name="shell.bell" fallback={null}>
      <Own />
    </CustomBoundary>
  ) : (
    <Suspense fallback={null}>
      <NotificationBell />
    </Suspense>
  )
