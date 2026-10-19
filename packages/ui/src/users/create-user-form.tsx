import { useState } from 'react'
import type { RoleLabel } from '@protobase/client'
import { AccountSection, SectionError } from '../account/account-section'
import { useAuth } from '../auth/auth-provider'
import { minPasswordLength } from '../auth/reset-password-form'
import { AppRolesPicker } from '../organizations/app-roles-picker'
import { useAction } from '../organizations/use-action'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { text } from './messages'

/** Adding an account directly, with its roles and, if wanted, a password; without one the person signs in another way. */
export const CreateUserForm = ({ roles, onCreated }: { roles: readonly RoleLabel[]; onCreated: () => void }) => {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const { busy, error, run } = useAction()
  const create = () =>
    run(async () => {
      await session.users.create({ email: email.trim(), name: name.trim(), roles: selected, ...(password && { password }) })
      setEmail('')
      setName('')
      setPassword('')
      setSelected([])
      onCreated()
    })
  const incomplete = !email.trim() || !name.trim() || selected.length === 0 || (password !== '' && password.length < minPasswordLength)
  return (
    <AccountSection title={text('addAnAccount')} description={text('addDescription')}>
      <SectionError message={error} />
      <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void create() }}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input aria-label={text('email')} type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} wrapperClassName="flex-1" />
          <Input aria-label={text('name')} placeholder={text('name')} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} wrapperClassName="flex-1" />
        </div>
        <Input aria-label={text('password')} type="password" autoComplete="new-password" placeholder={text('passwordOptional', minPasswordLength)} value={password} onChange={(event) => setPassword(event.target.value)} />
        <AppRolesPicker roles={roles} selected={selected} grantable={new Set(roles.map((role) => role.name))} onChange={setSelected} />
        <div>
          <Button type="submit" variant="primary" loading={busy} disabled={incomplete}>{text('addAccount')}</Button>
        </div>
      </form>
    </AccountSection>
  )
}
