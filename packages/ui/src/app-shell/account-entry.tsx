import { UserRound } from 'lucide-react'
import { cn } from '../lib/cn'
import type { RouteTarget } from '../primitives/route-link'
import { RouteLink } from '../primitives/route-link'
import { text } from './messages'
import { ProfileMenu, type ProfileMenuProps } from './profile-menu'

export type AccountEntryProps = Omit<ProfileMenuProps, 'user' | 'compact' | 'label'> & {
  user?: ProfileMenuProps['user']
  /** Where someone signed out signs in; without it, and without `user`, there is no entry. */
  signIn?: RouteTarget
  /** On a brand-coloured bar, whose foreground the guest icon then takes. */
  onBrand?: boolean
}

/**
 * The way into the account at the top right of a phone page, as a phone app has it: the person's avatar, which opens
 * their menu as a sheet (MenuSurface), read as "Account, <name>"; or, for someone signed out, a guest icon the same size that signs in,
 * read as "Sign in". Both sit in a tap area of at least 44 points.
 */
export const AccountEntry = ({ user, signIn, onBrand, ...menu }: AccountEntryProps) => {
  if (!user && !signIn) return null
  return (
    <div className="flex min-h-11 min-w-11 shrink-0 items-center justify-end" onClick={(event) => event.stopPropagation()}>
      {user ? (
        <ProfileMenu user={user} compact label={text('accountOf', { name: user.name })} {...menu} />
      ) : (
        signIn && (
          <RouteLink to={signIn} aria-label={text('signIn')} className="flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-muted">
            <span className={cn('flex size-8 items-center justify-center rounded-full', onBrand ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              <UserRound className="size-5" aria-hidden />
            </span>
          </RouteLink>
        )
      )}
    </div>
  )
}
