import { useState } from 'react'
import type { AuthenticatorSetup, SignInRule } from '@protobase/client'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { AccountSection } from './account-section'
import { BackupCodes } from './backup-codes'
import { PasswordDialog } from './password-dialog'
import { TwoFactorSetup } from './two-factor-setup'
import { text } from './messages'

export type TwoFactorSectionProps = {
  /** What the sign-in policy says about two-factor authentication. */
  rule: SignInRule
  /** The account has it on, with an authenticator app (and backup codes) or with emailed codes only. */
  enabled: boolean
  authenticatorApp: boolean
  /** Mail can be sent, so emailed codes are offered. */
  mail: boolean
  /** The account has a password, which changes here ask for. */
  needsPassword: boolean
  /** Each rejects with `AuthError`, which the section shows. */
  onStartApp: (password?: string) => Promise<AuthenticatorSetup>
  onConfirmApp: (code: string) => Promise<void>
  onEmailedCodes: (password?: string) => Promise<void>
  onTurnOff: (password?: string) => Promise<void>
  onNewBackupCodes: (password?: string) => Promise<string[]>
  /** Something changed: read the account again. */
  onChanged: () => void
}

const offDescriptions = { allowed: 'twoFactorAllowed', required: 'twoFactorRequired', forbidden: 'twoFactorForbidden' } as const satisfies Record<SignInRule, string>

type Open = { kind: 'setup'; appOnly: boolean } | { kind: 'turn-off' } | { kind: 'new-codes' } | { kind: 'codes'; codes: string[] }

export const TwoFactorSection = (props: TwoFactorSectionProps) => {
  const { rule, enabled, authenticatorApp, mail, needsPassword, onTurnOff, onNewBackupCodes, onChanged } = props
  const [open, setOpen] = useState<Open>()
  const close = () => setOpen(undefined)

  const status = enabled ? <Badge tone="green">{text('on')}</Badge> : rule === 'required' ? <Badge tone="amber">{text('required')}</Badge> : <Badge>{text('off')}</Badge>
  const description = !enabled
    ? text(offDescriptions[rule])
    : authenticatorApp
      ? text(mail ? 'twoFactorOnWithAppOrMail' : 'twoFactorOnWithApp')
      : text('twoFactorOnWithMail')

  if (open?.kind === 'setup') {
    return (
      <AccountSection title={text('twoFactor')} status={status} description={description}>
        <div className="max-w-sm">
          <TwoFactorSetup
            offerEmailedCodes={mail && !open.appOnly}
            needsPassword={needsPassword}
            onStartApp={props.onStartApp}
            onConfirmApp={props.onConfirmApp}
            onEmailedCodes={props.onEmailedCodes}
            onCancel={close}
            onDone={() => {
              close()
              onChanged()
            }}
          />
        </div>
      </AccountSection>
    )
  }

  return (
    <AccountSection title={text('twoFactor')} status={status} description={description}>
      <div className="flex flex-wrap gap-2">
        {!enabled && rule !== 'forbidden' && (
          <Button variant="primary" onClick={() => setOpen({ kind: 'setup', appOnly: false })}>
            {text('turnOn')}
          </Button>
        )}
        {enabled && !authenticatorApp && rule !== 'forbidden' && <Button onClick={() => setOpen({ kind: 'setup', appOnly: true })}>{text('addAuthenticator')}</Button>}
        {enabled && authenticatorApp && <Button onClick={() => setOpen({ kind: 'new-codes' })}>{text('newBackupCodes')}</Button>}
        {enabled && (
          <Button variant="danger" disabled={rule === 'required'} title={rule === 'required' ? text('twoFactorIsRequired') : undefined} onClick={() => setOpen({ kind: 'turn-off' })}>
            {text('turnOff')}
          </Button>
        )}
      </div>
      {open?.kind === 'turn-off' && (
        <PasswordDialog
          title={text('turnOffTitle')}
          description={text('turnOffDescription')}
          confirmLabel={text('turnOff')}
          danger
          needsPassword={needsPassword}
          onClose={close}
          onConfirm={async (password) => {
            await onTurnOff(password)
            close()
            onChanged()
          }}
        />
      )}
      {open?.kind === 'new-codes' && (
        <PasswordDialog
          title={text('newCodesTitle')}
          description={text('newCodesDescription')}
          confirmLabel={text('makeNewCodes')}
          needsPassword={needsPassword}
          onClose={close}
          onConfirm={async (password) => setOpen({ kind: 'codes', codes: await onNewBackupCodes(password) })}
        />
      )}
      {open?.kind === 'codes' && (
        <Dialog
          title={text('yourNewCodes')}
          description={text('keepCodesSafe')}
          onClose={close}
          actions={
            <Button variant="primary" onClick={close}>
              {text('savedCodes')}
            </Button>
          }
        >
          <BackupCodes codes={open.codes} />
        </Dialog>
      )}
    </AccountSection>
  )
}
