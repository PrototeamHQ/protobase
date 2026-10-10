import { useEffect, useRef } from 'react'
import { AuthError } from '@protobase/client'
import { Spinner } from '../primitives/spinner'
import { signInMessage } from './auth-messages'
import { AuthLayout } from './auth-layout'
import { useAuth } from './auth-provider'
import { providerName } from './provider-link'

/** What the page shows while the browser leaves for the provider `name`. */
export const ProviderRedirect = ({ name, workspace }: { name: string; workspace?: string }) => (
  <AuthLayout title={`Signing in with ${name}`} description={workspace}>
    <p role="status" className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
      <Spinner /> Taking you to {name}…
    </p>
  </AuthLayout>
)

/**
 * Starts signing in with `provider` at once, for a link such as `/?sign-in=github`, so someone the provider knows lands
 * signed in without a sign-in page. A provider the server does not offer, or a start it refuses, goes to `onFailed`.
 */
export const ProviderSignInPage = ({ provider, workspace, onFailed }: { provider: string; workspace?: string; onFailed: (message: string) => void }) => {
  const { signInProviders, signInSocial } = useAuth()
  const offered = signInProviders.find((candidate) => candidate.id === provider)
  const name = offered?.name ?? providerName(provider)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!offered) return onFailed(`Signing in with ${name} is not offered here. Sign in another way.`)
    signInSocial(provider).catch((failure: unknown) => {
      if (!(failure instanceof AuthError)) throw failure
      onFailed(signInMessage(failure))
    })
  }, [offered, name, provider, signInSocial, onFailed])

  return <ProviderRedirect name={name} workspace={workspace} />
}
