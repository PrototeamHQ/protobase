import { cn } from '../lib/cn'
import { Avatar } from '../primitives/avatar'
import { hueOf, initialsOf } from '../primitives/avatar-initials'
import { LogoMark } from './logo-mark'

/** The name an app goes by when it names itself nothing. */
export const brandName = 'Protobase'

export type AppMarkProps = {
  /** The app's name, such as `Shop & Co`. */
  appName?: string
  /** The path of the app's own icon, when it has one. */
  appIcon?: string
  /** `sm` beside the name in the sidebar, `lg` above the title of the sign-in page. */
  size?: 'sm' | 'lg'
  className?: string
}

const iconSizes = { sm: 'size-7', lg: 'size-10' }
const avatarSizes = { sm: 'md', lg: 'lg' } as const

/**
 * The mark that stands for the app: its own icon; else, for an app with a name of its own, its initial in an avatar, so
 * it shows no Protobase mark; else Protobase's mark.
 */
export const AppMark = ({ appName, appIcon, size = 'sm', className }: AppMarkProps) => {
  if (appIcon) return <img src={appIcon} alt="" className={cn(iconSizes[size], 'shrink-0 object-contain', className)} />
  if (appName && appName !== brandName) return <Avatar initials={initialsOf(appName).slice(0, 1)} hue={hueOf(appName)} size={avatarSizes[size]} className={className} />
  return <LogoMark className={cn(iconSizes[size], className)} />
}
