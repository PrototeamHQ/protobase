import { useState } from 'react'
import { SectionError } from '../account/account-section'
import { AppInvitations } from './app-invitations'
import { CreateUserForm } from './create-user-form'
import { UserList } from './user-list'
import { useUserRoles } from './use-user-roles'

/** The `Users` block: everyone who can sign in, inviting someone, and adding an account, for admins. */
export const UsersBlock = () => {
  const { roles, error } = useUserRoles()
  const [version, setVersion] = useState(0)
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <SectionError message={error} />
      <UserList roles={roles} version={version} />
      <AppInvitations roles={roles} />
      <CreateUserForm roles={roles} onCreated={() => setVersion((current) => current + 1)} />
    </div>
  )
}
