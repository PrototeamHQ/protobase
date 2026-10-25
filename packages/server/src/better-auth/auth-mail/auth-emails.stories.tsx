import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { mentionEmail } from '../../comments/mention-email'
import type { RenderedEmail } from '../../mail/define-email'
import { accountExistsEmail, changeEmailCodeEmail, invitationEmail, noAccountEmail, resetPasswordEmail, signInCodeEmail, signUpCodeEmail, staffSignInEmail, twoFactorCodeEmail } from './auth-emails'

// Each auth email as Protobase renders it: the HTML part in a frame as wide as a mail client's reading pane, with the
// subject and the plain-text part beside it.
const meta = { title: 'Auth/Emails', tags: ['play'], parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

type Story = StoryObj<{ email: RenderedEmail }>

const app = { name: 'Property Finder', url: 'https://homes.example.com/' }
const expiresAt = new Date('2026-10-22T12:00:00Z')

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

export const SignUpCode = story(() => signUpCodeEmail.render({ app, code: '482913', lifetime: '5 minutes' }), (body) => expect(body.textContent).toContain('482913'))

export const AccountExists = story(
  () => accountExistsEmail.render({ app }),
  (body) => expect(body.querySelector('a[href="https://homes.example.com/-/sign-in"]')?.textContent).toBe('Sign in to Property Finder'),
)

export const NoAccount = story(
  () => noAccountEmail.render({ app }),
  (body) => expect(body.querySelector('a[href="https://homes.example.com/-/sign-in"]')?.textContent).toBe('Sign in to Property Finder'),
)

export const SignInCode = story(() => signInCodeEmail.render({ app, code: '482913', lifetime: '5 minutes' }))

export const TwoFactorCode = story(() => twoFactorCodeEmail.render({ app, code: '482913', lifetime: '5 minutes' }))

export const ChangeEmailCode = story(() => changeEmailCodeEmail.render({ app, code: '482913', lifetime: '5 minutes' }), (body) => expect(body.textContent).toContain('Confirm your new address'))

export const ResetPassword = story(() =>
  resetPasswordEmail.render({ app, url: 'https://homes.example.com/api/auth/reset-password/abc?callbackURL=%2F', lifetime: '1 hour' }),
)

export const StaffSignIn = story(() =>
  staffSignInEmail.render({ app, staff: 'Alex Jansen (alex@operator.example)', reason: 'Ticket 1234: saved searches do not send alerts', expiresAt }),
)

export const Invitation = story(() =>
  invitationEmail.render({ app, inviter: 'Ada Lovelace', organization: 'Utrecht Rentals', url: 'https://homes.example.com/-/invitation?token=abc', expiresAt }),
)

export const AppInvitation = story(() => invitationEmail.render({ app, inviter: 'Ada Lovelace', url: 'https://homes.example.com/-/invitation?token=abc', expiresAt }))

export const Mention = story(
  () =>
    mentionEmail.render({ app, author: 'Ann de Vries', record: 'Listing: Keizersgracht 12', body: 'Can you call the owner, @Bo Jansen?\nThey asked about the viewing.', url: 'https://homes.example.com/listings/12' }),
  (body) => expect(body.querySelector('a[href="https://homes.example.com/listings/12"]')?.textContent).toBe('Open Listing: Keizersgracht 12'),
)
