import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { commentLines, mentionEmail } from '../../comments/mention-email'
import type { RenderedEmail } from '../../mail/define-email'
import { accountExistsEmail, appInvitationEmail, changeEmailCodeEmail, confirmationCodeEmail, invitationEmail, noAccountEmail, resetPasswordEmail, signInCodeEmail, signUpCodeEmail, staffSignInEmail, twoFactorCodeEmail } from './auth-emails'

// Each auth email as Protobase renders it: the HTML part in a frame as wide as a mail client's reading pane, with the
// subject and the plain-text part beside it.
const meta = { title: 'Auth/Emails', tags: ['play'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

type Story = StoryObj<{ email: RenderedEmail }>

const app = { name: 'Property Finder', url: 'https://homes.example.com/' }
const expiresAt = 'October 22, 2026 at 12:00 PM UTC'

const Preview = ({ email }: { email: RenderedEmail }) => (
  <div className="flex flex-wrap gap-6 p-6">
    <div>
      <p className="mb-2 text-sm font-semibold" data-testid="subject">
        {email.subject}
      </p>
      <iframe title="HTML part" srcDoc={email.html} className="h-[560px] w-[600px] max-w-full border" />
    </div>
    <pre className="max-w-[420px] text-xs whitespace-pre-wrap" data-testid="text">
      {email.text}
    </pre>
  </div>
)

// The frame's document once it has loaded the HTML part.
const frameBody = async (canvasElement: HTMLElement) => {
  const frame = canvasElement.querySelector('iframe')!
  await waitFor(() => expect(frame.contentDocument?.body.textContent).toContain('Property Finder'))
  return frame.contentDocument!.body
}

const story = (render: () => Promise<RenderedEmail>, check?: (body: HTMLElement) => void): Story => ({
  loaders: [async () => ({ email: await render() })],
  render: (_, { loaded }) => <Preview email={loaded.email as RenderedEmail} />,
  play: async ({ canvasElement }) => {
    const body = await frameBody(canvasElement)
    expect(body.querySelector('a[href="https://homes.example.com/"]')).not.toBeNull()
    check?.(body)
  },
})

export const SignUpCode = story(() => signUpCodeEmail.render({ code: '482913', minutes: 10 }, { app }), (body) => expect(body.textContent).toContain('482913'))

export const AccountExists = story(
  () => accountExistsEmail.render({}, { app }),
  (body) => expect(body.querySelector('a[href="https://homes.example.com/-/sign-in"]')?.textContent).toBe('Sign in to Property Finder'),
)

export const NoAccount = story(
  () => noAccountEmail.render({}, { app }),
  (body) => expect(body.querySelector('a[href="https://homes.example.com/-/sign-in"]')?.textContent).toBe('Sign in to Property Finder'),
)

export const SignInCode = story(() => signInCodeEmail.render({ code: '482913', minutes: 10 }, { app }))

export const TwoFactorCode = story(() => twoFactorCodeEmail.render({ code: '482913', minutes: 10 }, { app }))

export const ConfirmationCode = story(() => confirmationCodeEmail.render({ code: '482913', minutes: 10 }, { app }), (body) => expect(body.textContent).toContain('It does not sign you in'))

export const ChangeEmailCode = story(() => changeEmailCodeEmail.render({ code: '482913', minutes: 10 }, { app }), (body) => expect(body.textContent).toContain('Confirm your new address'))

export const ResetPassword = story(() =>
  resetPasswordEmail.render({ url: 'https://homes.example.com/api/auth/reset-password/abc?callbackURL=%2F', hours: 1 }, { app }),
)

export const StaffSignIn = story(() =>
  staffSignInEmail.render({ staff: 'Alex Jansen (alex@operator.example)', reason: 'Ticket 1234: saved searches do not send alerts', expiresAt }, { app }),
)

export const Invitation = story(() =>
  invitationEmail.render({ inviter: 'Ada Lovelace', organization: 'Utrecht Rentals', url: 'https://homes.example.com/-/invitation?token=abc', expiresAt }, { app }),
)

export const AppInvitation = story(() => appInvitationEmail.render({ inviter: 'Ada Lovelace', url: 'https://homes.example.com/-/invitation?token=abc', expiresAt }, { app }))

export const Mention = story(
  () =>
    mentionEmail.render({ author: 'Ann de Vries', record: 'Listing: Keizersgracht 12', lines: commentLines('Can you call the owner, @Bo Jansen?\nThey asked about the viewing.'), url: 'https://homes.example.com/listings/12' }, { app }),
  (body) => expect(body.querySelector('a[href="https://homes.example.com/listings/12"]')?.textContent).toBe('Open Listing: Keizersgracht 12'),
)
