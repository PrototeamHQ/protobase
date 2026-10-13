import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import type { SignInPromptModel } from '@protobase/schema'
import { swipeDown } from '../app/testing/swipe'
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
    <SignInPrompt as="page" prompt={prompt} />
  </AuthProvider>
)

const Opener = ({ prompt }: { prompt: SignInPromptModel }) => {
  const [open, setOpen] = useState(false)
  return (
    <AuthProvider session={session}>
      <div className="p-6">
        <Button onClick={() => setOpen(true)}>Save to favorites</Button>
        <SignInPrompt as="dialog" prompt={prompt} open={open} onClose={() => setOpen(false)} />
      </div>
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
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(body.getByRole('button', { name: 'Save to favorites' }))
    const sheet = await body.findByRole('dialog', { name: 'Hear about new homes first' })
    // It slides up from the bottom of the screen and settles against it
    expect(getComputedStyle(sheet).transitionProperty).toContain('transform')
    await waitFor(() => expect(sheet).not.toHaveAttribute('data-starting-style'))
    await waitFor(() => expect(sheet.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0))
    expect(within(sheet).getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', 'https://example.com/join')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
  },
}

const openSheet = async (canvasElement: HTMLElement) => {
  const body = within(canvasElement.ownerDocument.body)
  await userEvent.click(body.getByRole('button', { name: 'Save to favorites' }))
  const sheet = await body.findByRole('dialog', { name: 'Keep the homes you like' })
  await waitFor(() => expect(sheet.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0))
  return sheet
}

/** A drag down on the sheet moves it with the finger; a short one lets it spring back, a long one closes it. */
export const SheetPhoneSwipe: StoryObj = {
  name: 'As a sheet on a phone, swiped down (checks)',
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone', '!dev'],
  render: () => <Opener prompt={favorites} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const sheet = await openSheet(canvasElement)
    const title = within(sheet).getByRole('heading', { name: 'Keep the homes you like' })
    await swipeDown(title, 24)
    await waitFor(() => expect(sheet.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0))
    expect(body.getByRole('dialog', { name: 'Keep the homes you like' })).toBe(sheet)

    await swipeDown(title, 240)
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
    expect(body.getByRole('button', { name: 'Save to favorites' })).toHaveFocus()
  },
}

/** A press above the sheet and Escape close it too, and "Not now" does. */
export const SheetPhoneDismiss: StoryObj = {
  name: 'As a sheet on a phone, closed without swiping (checks)',
  globals: { viewport: { value: 'phone360' } },
  tags: ['play', 'phone', '!dev'],
  render: () => <Opener prompt={favorites} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const above = () => canvasElement.ownerDocument.elementFromPoint(window.innerWidth / 2, 20)!
    await openSheet(canvasElement)
    await userEvent.click(above())
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())

    await openSheet(canvasElement)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())

    const sheet = await openSheet(canvasElement)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
  },
}
