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
  const appRoles = invitation.appRoles.map((role) => roleLabel(roles, role)).join(', ') || t('noAppRoles')
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">{appRoles} · {t('until', { date: new Date(invitation.expiresAt).toLocaleDateString(formatTag()) })}</span>
      </span>
      <Button size="sm" variant="primary" loading={busy} onClick={onJoin}>{t('join', { name })}</Button>
    </li>
  )
}
