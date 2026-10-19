import { Check, LogIn } from 'lucide-react'
import { useId } from 'react'
import type { SignInPromptModel } from '@protobase/schema'
import { namedIcon } from '../app/named-icon'
import { Button, buttonClass } from '../primitives/button'
import { RouteLink } from '../primitives/route-link'
import { ResponsiveDialog } from '../primitives/responsive-dialog'
import { useAuth } from './auth-provider'
import { useSignInAddress } from './use-sign-in-address'
import { text } from './messages'

export type SignInPromptProps = { prompt: SignInPromptModel } & (
  /** A page section, in place of what the visitor cannot use yet. */
  | { as: 'page' }
  /** A modal on a desktop and a sheet on a phone (`ResponsiveDialog`), after the visitor tried what needs an account. */
  | { as: 'dialog'; open: boolean; onClose: () => void }
)

const Benefits = ({ benefits }: { benefits: string[] | undefined }) =>
  benefits && benefits.length > 0 ? (
    <ul className="flex flex-col gap-2 text-left">
      {benefits.map((benefit) => (
        <li key={benefit} className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {benefit}
        </li>
      ))}
    </ul>
  ) : null

// "Sign in" opens the app's sign-in route, which comes back to this page. A page the prompt names to make an account
// opens in a new tab; without one, "Create an account" opens the route's sign-up step when the server has open sign-up.
// A visitor is most likely new, so making an account is the primary action, last in the row, and "Sign in" the
// secondary one; without a way to make an account, "Sign in" is the primary action.
const Actions = ({ prompt }: { prompt: SignInPromptModel }) => {
  const { canSignUp } = useAuth()
  const { link } = useSignInAddress()
  const primary = buttonClass({ variant: 'primary' })
  const signUp = prompt.signUp ? (
    <a href={prompt.signUp.href} target="_blank" rel="noreferrer" className={primary}>
      {prompt.signUp.label}
    </a>
  ) : (
    canSignUp && (
      <RouteLink to={link('sign-up')} className={primary}>
        {text('createAnAccount')}
      </RouteLink>
    )
  )
  return (
    <>
      <RouteLink to={link()} className={signUp ? buttonClass() : primary}>
        {text('signIn')}
      </RouteLink>
      {signUp}
    </>
  )
}

/**
 * What a visitor who is not signed in is told about something they could use once signed in: the prompt's title, what
 * signing in gives and its benefits, with "Sign in" and a way to make an account: the page the prompt names, or the
 * app's own sign-up when the server has it. As a page
 * it stands in for a list the visitor cannot see; as a dialog it answers a press on a button that needs an account.
 */
export const SignInPrompt = (props: SignInPromptProps) => {
  const { prompt } = props
  const heading = useId()
  if (props.as === 'dialog') {
    return (
      <ResponsiveDialog
        title={prompt.title}
        description={prompt.description}
        open={props.open}
        onClose={props.onClose}
        actions={
          <>
            <Button onClick={props.onClose}>{text('notNow')}</Button>
            <Actions prompt={prompt} />
          </>
        }
      >
        <Benefits benefits={prompt.benefits} />
      </ResponsiveDialog>
    )
  }
  const Icon = namedIcon(prompt.icon) ?? LogIn
  return (
    <section aria-labelledby={heading} className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-5 py-10 text-center sm:py-16">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 id={heading} className="text-lg font-semibold">
          {prompt.title}
        </h1>
        <p className="text-muted-foreground">{prompt.description}</p>
      </div>
      <Benefits benefits={prompt.benefits} />
      <div className="mt-2 flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-center [&>*]:min-h-11 sm:[&>*]:min-h-0">
        <Actions prompt={prompt} />
      </div>
    </section>
  )
}
