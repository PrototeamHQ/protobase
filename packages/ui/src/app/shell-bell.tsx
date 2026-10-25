import type { ComponentType } from 'react'
import { NotificationBell } from '../notifications/bell/notification-bell'
import { CustomBoundary } from './pages/custom-boundary'

/** The top bar's notification bell, or the project's or a plugin's `shell.bell` in its place. */
export const ShellBell = ({ own: Own }: { own: ComponentType | undefined }) =>
  Own ? (
    <CustomBoundary name="shell.bell" fallback={null}>
      <Own />
    </CustomBoundary>
  ) : (
    <NotificationBell />
  )
