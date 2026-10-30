import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { OtpInput } from '../primitives/otp-input'
import { SectionError } from './account-section'
import { text } from './messages'

/** Changing the address: a code mailed to the new one, then that code. Each rejects with `AuthError`, which the dialog shows. */
export type EmailChange = {
  request: (newEmail: string) => Promise<void>
  confirm: (newEmail: string, code: string) => Promise<void>
}

export type ChangeEmailDialogProps = { email: string; change: EmailChange; onDone: () => void; onClose: () => void }

/** Asks for the new address, mails it a code, and moves the account to it once the code is right. */
export const ChangeEmailDialog = ({ email, change, onDone, onClose }: ChangeEmailDialogProps) => {
  const [draft, setDraft] = useState('')
  const [sentTo, setSentTo] = useState<string>()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const run = async (step: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await step()
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(false)
  }

  const newEmail = draft.trim()
  const send = () =>
    run(async () => {
      await change.request(newEmail)
      setCode('')
      setSentTo(newEmail)
    })
  const confirm = (complete: string) =>
    run(async () => {
      await change.confirm(sentTo!, complete)
      onDone()
    })

  if (!sentTo) {
    return (
      <Dialog
        title={text('changeEmail')}
        description={text('changeEmailDescription')}
        onClose={onClose}
        actions={
          <>
            <Button onClick={onClose}>{text('cancel')}</Button>
            <Button variant="primary" loading={busy} disabled={!newEmail || newEmail.toLowerCase() === email.toLowerCase()} onClick={() => void send()}>
              {text('sendCode')}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1.5 font-medium">
          {text('newEmail')}
          <Input type="email" autoComplete="email" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <SectionError message={error} />
      </Dialog>
    )
  }

  return (
    <Dialog
      title={text('changeEmail')}
      description={text('codeSentTo', { email: sentTo })}
      onClose={onClose}
      actions={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setSentTo(undefined)
              setError(undefined)
            }}
          >
            {text('otherAddress')}
          </Button>
          <Button variant="primary" loading={busy} disabled={code.length < 6} onClick={() => void confirm(code)}>
            {text('changeEmail')}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 font-medium">
        {text('code')}
        <OtpInput name="code" required autoFocus value={code} invalid={Boolean(error)} onChange={setCode} onComplete={(complete) => !busy && void confirm(complete)} />
      </label>
      <SectionError message={error} />
    </Dialog>
  )
}
