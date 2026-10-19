import { useState, type ReactNode } from 'react'
import { AccountSection, SectionError } from '../account/account-section'
import { useAction } from '../organizations/use-action'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { LinkNotice } from './link-notice'
import { text } from './messages'

export type InviteFormProps = {
  title: string
  description: string
  /** Sends the invitation, with the roles the form's controls hold; answers its link when the app cannot email it. */
  onInvite: (email: string) => Promise<{ link?: string }>
  /** Controls on the line of the address, before Invite, such as a role to choose. */
  beside?: ReactNode
  /** The lines under it, such as the roles to give. */
  children?: ReactNode
  /** Keeps Invite off while the controls do not say enough yet, such as no role chosen. */
  incomplete?: boolean
}

/** Inviting an address: the address, the controls for what the invitation gives, Invite, and the link without mail. */
export const InviteForm = ({ title, description, onInvite, beside, children, incomplete = false }: InviteFormProps) => {
  const [email, setEmail] = useState('')
  const [link, setLink] = useState<string>()
  const { busy, error, run } = useAction()
  const invite = () =>
    run(async () => {
      setLink((await onInvite(email.trim())).link)
      setEmail('')
    })
  return (
    <AccountSection title={title} description={description}>
      <SectionError message={error} />
      <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void invite() }}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input aria-label={text('email')} type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} wrapperClassName="flex-1" />
          {beside}
          <Button type="submit" variant="primary" loading={busy} disabled={!email.trim() || incomplete}>{text('invite')}</Button>
        </div>
        {children}
      </form>
      <LinkNotice link={link} />
    </AccountSection>
  )
}
