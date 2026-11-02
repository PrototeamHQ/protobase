import { useMutation, useQuery } from '@tanstack/react-query'
import { emailCodeMinutes } from '@protobase/schema/internal'
import { useState } from 'react'
import { useOptionalAuth } from '../auth/auth-provider'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { OtpInput } from '../primitives/otp-input'
import { text } from './confirm-sign-in-messages'

export type ConfirmSignInProps = {
  /** How recent the strong sign-in must be, as the refusal says. */
  minutes: number
  /** What asked for it: showing a value (the default), or an account change. */
  purpose?: 'show' | 'change'
  /** Offer the account's password as well: only adding a first passkey takes it, and only for that change. */
  withPassword?: boolean
  /** Called once the person confirmed, to ask again. */
  onConfirmed: () => void
}

/**
 * Asks the person to confirm it's them, after the server refused something that needs a recent strong sign-in
 * (`strong-sign-in-required`, or `STRONG_SIGN_IN_REQUIRED` for an account change). It offers only what the account has:
 * a passkey signs the browser in anew, and a code from the authenticator app confirms the session it has. An account
 * with an emailed second step confirms with that code, and one with neither a passkey nor a second step with a
 * confirmation code emailed on request, or with its password when `withPassword` asks for it.
 */
export const ConfirmSignIn = ({ minutes, purpose = 'show', withPassword = false, onConfirmed }: ConfirmSignInProps) => {
  const auth = useOptionalAuth()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [emailed, setEmailed] = useState('')
  const [sent, setSent] = useState(false)
  const methods = useQuery({ queryKey: ['account-sign-in-methods'], queryFn: () => auth!.session.account.signInMethods(), enabled: Boolean(auth) })
  const passkey = useMutation({ mutationFn: () => auth!.signInWithPasskey(), onSuccess: onConfirmed })
  const authenticator = useMutation({ mutationFn: (entered: string) => auth!.verifyTwoFactor({ method: 'totp', code: entered }), onSuccess: onConfirmed })
  const account = methods.data?.account
  // An account whose second step is an emailed code confirms with that; one with neither a passkey nor a second step
  // with a confirmation code emailed on request.
  const byEmail = !account ? undefined : account.twoFactor && !account.authenticatorApp ? 'second-step' : methods.data?.mail && account.passkeys === 0 && !account.twoFactor ? 'confirmation' : undefined
  const byPassword = withPassword && account !== undefined && account.password && account.passkeys === 0 && !account.twoFactor
  const passwordCheck = useMutation({ mutationFn: (entered: string) => auth!.session.account.confirmWithPassword(entered), onSuccess: onConfirmed })
  const emailCode = useMutation({
    mutationFn: async (entered: string) => {
      if (byEmail === 'second-step') await auth!.verifyTwoFactor({ method: 'otp', code: entered })
      else await auth!.session.account.confirmWithCode(entered)
    },
    onSuccess: onConfirmed,
  })
  // A new code ends the one before, and the wrong tries with it.
  const sendCode = useMutation({
    mutationFn: () => (byEmail === 'second-step' ? auth!.session.sendTwoFactorCode() : auth!.session.account.sendConfirmationCode()),
    onSuccess: () => {
      setSent(true)
      setEmailed('')
      emailCode.reset()
    },
  })
  const error = passkey.error ?? authenticator.error ?? passwordCheck.error ?? sendCode.error ?? emailCode.error ?? methods.error

  return (
    <section aria-label={text('confirmTitle')} className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
      <p className="font-medium">{text('confirmTitle')}</p>
      <p className="text-muted-foreground">{text(purpose === 'change' ? 'confirmWhyChange' : 'confirmWhy', { minutes })}</p>
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
      {byPassword && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            passwordCheck.mutate(password)
          }}
        >
          <label className="flex flex-col gap-1.5">
            {text('password')}
            <Input type="password" name="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <Button type="submit" size="sm" loading={passwordCheck.isPending}>
            {text('confirm')}
          </Button>
        </form>
      )}
      {byEmail && !sent && (
        <Button variant="primary" size="sm" className="self-start" loading={sendCode.isPending} onClick={() => sendCode.mutate()}>
          {text('emailCode')}
        </Button>
      )}
      {byEmail && sent && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            emailCode.mutate(emailed.trim())
          }}
        >
          <p className="text-muted-foreground">{text('codeSent', { minutes: emailCodeMinutes })}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5">
              {text('emailedCode')}
              <OtpInput name="code" required value={emailed} invalid={emailCode.isError} onChange={setEmailed} onComplete={(entered) => emailCode.mutate(entered)} />
            </label>
            <Button type="submit" size="sm" loading={emailCode.isPending}>
              {text('confirm')}
            </Button>
            <Button size="sm" variant="ghost" loading={sendCode.isPending} onClick={() => sendCode.mutate()}>
              {text('emailNewCode')}
            </Button>
          </div>
        </form>
      )}
      {account && account.passkeys === 0 && !account.authenticatorApp && byEmail === undefined && !byPassword && <p>{text('nothingToConfirmWith')}</p>}
      {error && (
        <p role="alert" className="font-medium text-danger-text">
          {error.message}
        </p>
      )}
    </section>
  )
}
