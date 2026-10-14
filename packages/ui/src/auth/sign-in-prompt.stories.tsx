import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { SignInPromptModel } from '@protobase/schema'
import { Router } from '../app/router'
import { Button } from '../primitives/button'
import { AuthProvider } from './auth-provider'
import { SignInPrompt } from './sign-in-prompt'

const viewports = { phone360: { name: 'Phone 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Auth/Sign-in prompt', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'member' })

const favorites: SignInPromptModel = {
  title: 'Keep the homes you like',
  description: 'Sign in to save listings to your favorites and find them again on any device.',
  benefits: ['Save a listing with the heart on its card', 'See all your saved homes on one page', 'Add notes only you can read'],
  icon: 'heart',
}

// Another use of the same prompt, with its own text and a page to make an account.
const alerts: SignInPromptModel = {
  title: 'Hear about new homes first',
  description: 'Sign in to get an email when a home that fits your search comes on the market.',
  icon: 'bell',
  signUp: { label: 'Create an account', href: 'https://example.com/join' },
}

const Page = ({ prompt }: { prompt: SignInPromptModel }) => (
  <AuthProvider session={session}>
    <Router initialUrl="/favorites">
      <SignInPrompt as="page" prompt={prompt} />
    </Router>
  </AuthProvider>
)

const Opener = ({ prompt }: { prompt: SignInPromptModel }) => {
  const [open, setOpen] = useState(false)
  return (
    <AuthProvider session={session}>
      <Router initialUrl="/homes">
        <div className="p-6">
          <Button onClick={() => setOpen(true)}>Save to favorites</Button>
          <SignInPrompt as="dialog" prompt={prompt} open={open} onClose={() => setOpen(false)} />
        </div>
      </Router>
    </AuthProvider>
  )
}

export const FavoritesPage: StoryObj = { name: 'As a page', render: () => <Page prompt={favorites} /> }

export const AlertsPage: StoryObj = { name: 'As a page, with a sign-up page', render: () => <Page prompt={alerts} /> }

export const FavoritesPagePhone: StoryObj = { name: 'As a page on a phone', globals: { viewport: { value: 'phone360' } }, render: () => <Page prompt={favorites} /> }

export const Dialog: StoryObj = {
  name: 'As a dialog',
  tags: ['play'],
  render: () => <Opener prompt={favorites} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Save to favorites' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Keep the homes you like' })
    // A modal on a desktop: no close button of a sheet, "Not now" and "Sign in" instead
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull()
    expect(within(dialog).getByText('Add notes only you can read')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())
  },
}

export const DialogWithSignUp: StoryObj = { name: 'As a dialog, with a sign-up page', render: () => <Opener prompt={alerts} /> }

export const SheetPhone: StoryObj = {
  name: 'As a sheet on a phone',
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone'],
  render: () => <Opener prompt={alerts} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Save to favorites' }))
    const sheet = await canvas.findByRole('dialog', { name: 'Hear about new homes first' })
    expect(within(sheet).getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', 'https://example.com/join')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())
  },
}
