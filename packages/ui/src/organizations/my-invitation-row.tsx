import type { OrganizationInvitation } from '@protobase/client'
import { useAuth } from '../auth/auth-provider'
import { formatTag } from '../locale/active-locale'
import { Button } from '../primitives/button'
import { roleLabel } from './organization-paths'
import type { OrganizationText } from './organization-word'

/** An invitation for the person's own address: where to, with which app roles, until when, and Join. */
export const MyInvitationRow = ({ invitation, t, busy, onJoin }: { invitation: OrganizationInvitation; t: OrganizationText; busy: boolean; onJoin: () => void }) => {
  const roles = useAuth().organizations?.roles ?? []
  const name = invitation.organizationName ?? t('anOrganization')
  const appRoles = invitation.appRoles.map((role) => roleLabel(roles, role)).join(', ')
  const expires = t('expires', { date: new Date(invitation.expiresAt).toLocaleDateString(formatTag(), { dateStyle: 'long' }) })
  // On a phone the button goes under the name, full width, so a long name stays whole
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="min-w-0 flex-1">
        <span className="block break-words font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">{appRoles ? `${appRoles} · ${expires}` : expires}</span>
      </span>
      <Button variant="primary" loading={busy} onClick={onJoin} className="min-h-10 w-full sm:min-h-0 sm:w-auto">{t('join', { name })}</Button>
    </li>
  )
}
