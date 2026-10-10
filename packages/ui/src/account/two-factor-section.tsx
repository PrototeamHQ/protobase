import { useState } from 'react'
import type { AuthenticatorSetup, SignInRule } from '@protobase/client'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { AccountSection } from './account-section'
import { BackupCodes } from './backup-codes'
import { PasswordDialog } from './password-dialog'
import { TwoFactorSetup } from './two-factor-setup'

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

const offDescriptions: Record<SignInRule, string> = {
  allowed: 'Ask for a second step after your password or an emailed sign-in code: a code from an authenticator app, or one emailed to you. A passkey needs no second step.',
  required: 'This app requires two-factor authentication for every account. Turn it on to keep using the app.',
  forbidden: 'Your admin turned two-factor authentication off for this app.',
}

type Open = { kind: 'setup'; appOnly: boolean } | { kind: 'turn-off' } | { kind: 'new-codes' } | { kind: 'codes'; codes: string[] }

export const TwoFactorSection = (props: TwoFactorSectionProps) => {
  const { rule, enabled, authenticatorApp, mail, needsPassword, onTurnOff, onNewBackupCodes, onChanged } = props
  const [open, setOpen] = useState<Open>()
  const close = () => setOpen(undefined)

  const status = enabled ? <Badge tone="green">On</Badge> : rule === 'required' ? <Badge tone="amber">Required</Badge> : <Badge>Off</Badge>
  const description = !enabled
    ? offDescriptions[rule]
    : authenticatorApp
      ? `Signing in with a password or an emailed sign-in code also asks for a code from your authenticator app${mail ? ', or one emailed to you' : ''}. Backup codes work when you do not have the app.`
      : 'Signing in with a password or an emailed sign-in code also asks for a code emailed to you.'

  if (open?.kind === 'setup') {
    return (
      <AccountSection title="Two-factor authentication" status={status} description={description}>
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
    <AccountSection title="Two-factor authentication" status={status} description={description}>
      <div className="flex flex-wrap gap-2">
        {!enabled && rule !== 'forbidden' && (
          <Button variant="primary" onClick={() => setOpen({ kind: 'setup', appOnly: false })}>
            Turn on
          </Button>
        )}
        {enabled && !authenticatorApp && rule !== 'forbidden' && <Button onClick={() => setOpen({ kind: 'setup', appOnly: true })}>Add an authenticator app</Button>}
        {enabled && authenticatorApp && <Button onClick={() => setOpen({ kind: 'new-codes' })}>New backup codes</Button>}
        {enabled && (
          <Button variant="danger" disabled={rule === 'required'} title={rule === 'required' ? 'This app requires two-factor authentication.' : undefined} onClick={() => setOpen({ kind: 'turn-off' })}>
            Turn off
          </Button>
        )}
      </div>
      {open?.kind === 'turn-off' && (
        <PasswordDialog
          title="Turn off two-factor authentication?"
          description="Signing in then needs only your password or an emailed code. Your backup codes stop working."
          confirmLabel="Turn off"
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
          title="Make new backup codes?"
          description="Your current backup codes stop working, and you get ten new ones."
          confirmLabel="Make new codes"
          needsPassword={needsPassword}
          onClose={close}
          onConfirm={async (password) => setOpen({ kind: 'codes', codes: await onNewBackupCodes(password) })}
        />
      )}
      {open?.kind === 'codes' && (
        <Dialog
          title="Your new backup codes"
          description="Keep them somewhere safe: each one signs you in once if you lose your phone. They are not shown again."
          onClose={close}
          actions={
            <Button variant="primary" onClick={close}>
              I saved my backup codes
            </Button>
          }
        >
          <BackupCodes codes={open.codes} />
        </Dialog>
      )}
    </AccountSection>
  )
}
