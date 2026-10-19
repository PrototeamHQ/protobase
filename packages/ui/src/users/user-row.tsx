import { useState } from 'react'
import type { AppUser, RoleLabel } from '@protobase/client'
import { useAuth } from '../auth/auth-provider'
import { AppRolesPicker } from '../organizations/app-roles-picker'
import { useAction } from '../organizations/use-action'
import { PersonRow } from '../people/person-row'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { text } from './messages'

/** Someone who can sign in, with Block or Unblock, and their roles to tick; an admin may give every role. */
export const UserRow = ({ user: initial, roles, self }: { user: AppUser; roles: readonly RoleLabel[]; self: boolean }) => {
  const { session } = useAuth()
  const [user, setUser] = useState(initial)
  const { busy, error, run, setError } = useAction()
  const setRoles = (selected: string[]) => {
    if (selected.length === 0) return setError(text('keepOneRole'))
    void run(async () => {
      await session.users.setRoles(user.id, selected)
      setUser({ ...user, roles: selected })
    })
  }
  const setBlocked = (blocked: boolean) =>
    void run(async () => {
      await (blocked ? session.users.block(user.id) : session.users.unblock(user.id))
      setUser({ ...user, blocked })
    })
  return (
    <PersonRow
      name={user.name}
      email={user.email}
      self={self}
      error={error}
      actions={
        <>
          {user.blocked && <Badge tone="red">{text('blocked')}</Badge>}
          {!self && (user.blocked ? <Button size="sm" loading={busy} onClick={() => setBlocked(false)}>{text('unblock')}</Button> : <Button size="sm" variant="danger" loading={busy} onClick={() => setBlocked(true)}>{text('block')}</Button>)}
        </>
      }
    >
      <AppRolesPicker roles={roles} selected={user.roles} grantable={new Set(roles.map((role) => role.name))} disabled={busy} onChange={setRoles} />
    </PersonRow>
  )
}
