import type { SignInPromptModel } from '@protobase/schema'
import { documentTitle, useDocumentTitle } from '../app/document-title'
import { useAdminMeta } from '../app/meta-gate'
import { AuthLayout } from '../auth/auth-layout'
import { useAuth } from '../auth/auth-provider'
import { SignInPromptActions } from '../auth/sign-in-prompt'
import { ConnectPage } from './connect-page'

// A visitor who opens the connect page signs in first; signing in comes back to it, request and all.
const connectPrompt: SignInPromptModel = { title: 'Sign in to connect an app', description: 'An app asks to act as you here. Sign in, then choose whether to allow it.' }

/**
 * `/-/connect`, alone on the page without the app's shell, as the sign-in pages are: the connect page for someone
 * signed in, else the way to sign in first. Both carry the app's name and icon.
 */
export const ConnectRoute = () => {
  const meta = useAdminMeta()
  const { state } = useAuth()
  useDocumentTitle(documentTitle(['Connect an app'], meta.appName))
  if (state.kind === 'signed-in') return <ConnectPage email={state.user.email} appName={meta.appName ?? 'this app'} appIcon={meta.appIcon} />
  return (
    <AuthLayout title={connectPrompt.title} description={connectPrompt.description} icon={meta.appIcon}>
      <div className="flex flex-col gap-2 [&>*]:min-h-10 [&>*]:w-full">
        <SignInPromptActions prompt={connectPrompt} />
      </div>
    </AuthLayout>
  )
}
