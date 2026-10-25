import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useOptionalAuth } from '../auth/auth-provider'
import { Button } from '../primitives/button'
import { OtpInput } from '../primitives/otp-input'
import { text } from './confirm-sign-in-messages'

export type ConfirmSignInProps = {
  /** How recent the strong sign-in must be, as the refusal says. */
  minutes: number
  /** Called once the person confirmed, to ask again. */
  onConfirmed: () => void
}

/**
 * Asks the person to confirm it's them, with a passkey or their authenticator app, after the server refused something
 * that needs a recent strong sign-in (`strong-sign-in-required`). It offers only what the account has; a passkey signs
 * the browser in anew, a code confirms the session it has.
 */
export const ConfirmSignIn = ({ minutes, onConfirmed }: ConfirmSignInProps) => {
  const auth = useOptionalAuth()
  const [code, setCode] = useState('')
  const methods = useQuery({ queryKey: ['account-sign-in-methods'], queryFn: () => auth!.session.account.signInMethods(), enabled: Boolean(auth) })
  const passkey = useMutation({ mutationFn: () => auth!.signInWithPasskey(), onSuccess: onConfirmed })
  const authenticator = useMutation({ mutationFn: (entered: string) => auth!.verifyTwoFactor({ method: 'totp', code: entered }), onSuccess: onConfirmed })
  const account = methods.data?.account
  const error = passkey.error ?? authenticator.error ?? methods.error

  return (
    <section aria-label={text('confirmTitle')} className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
      <p className="font-medium">{text('confirmTitle')}</p>
      <p className="text-muted-foreground">{text('confirmWhy', minutes)}</p>
      {account && account.passkeys > 0 && (
        <Button variant="primary" size="sm" className="self-start" loading={passkey.isPending} onClick={() => passkey.mutate()}>
          {text('usePasskey')}
        </Button>
      )}
      {account?.authenticatorApp && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            authenticator.mutate(code.trim())
          }}
        >
          <label className="flex flex-col gap-1.5">
            {text('authenticatorCode')}
            <OtpInput name="code" required value={code} invalid={authenticator.isError} onChange={setCode} onComplete={(entered) => authenticator.mutate(entered)} />
          </label>
          <Button type="submit" size="sm" loading={authenticator.isPending}>
            {text('confirm')}
          </Button>
        </form>
      )}
      {account && account.passkeys === 0 && !account.authenticatorApp && <p>{text('nothingToConfirmWith')}</p>}
      {error && (
        <p role="alert" className="font-medium text-danger-text">
          {error.message}
        </p>
      )}
    </section>
  )
}
