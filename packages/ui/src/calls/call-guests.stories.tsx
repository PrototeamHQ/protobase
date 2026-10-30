import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { CallGuests } from '@protobase/client/calls'
import { CallGuestsPanel } from './call-guests-panel'
import { CallLobbyNotice } from './call-lobby-notice'
import { CallMessage } from './call-message'
import { CallStage } from './call-stage'
import { CallWaiting } from './call-waiting'
import { GuestCallPage } from './guest-call-page'
import { storyPerson } from './testing/story-tracks'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const
const meta = { title: 'Components/Call guests', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

const phone = { globals: { viewport: { value: 'mobile360' } } }
const link = { id: 'l1', created_by: 'ann', publish: ['camera' as const, 'microphone' as const], expires_at: null }
const lobby = { guests: [{ guest: 'g1', name: '<b>Eve</b>', since: '2026-10-30T10:00:00.000Z' }], links: [link] }
const guests = (): CallGuests => ({
  link: fn(async () => ({ link, token: 'pbgl_story' })),
  revoke: fn(async () => {}),
  admit: fn(async () => {}),
  deny: fn(async () => {}),
  remove: fn(async () => {}),
})

const panel = (actions: CallGuests) => () => (
  <div className="h-[100dvh]">
    <CallGuestsPanel lobby={lobby} inCall={[{ guest: 'g2', name: 'Mal Reyes' }]} guests={actions} linkOf={(token) => `https://chat.example.com/-/call-guest#${token}`} open onClose={fn()} />
  </div>
)

const panelActions = guests()
const panelPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const page = within(canvasElement.ownerDocument.body)
  // The guest's name is their own text, markup and all, never drawn as markup.
  expect(await page.findByText('<b>Eve</b>')).toBeVisible()
  expect(canvasElement.ownerDocument.querySelector('b')).toBeNull()
  expect(page.getByText('Mal Reyes')).toBeVisible()
  expect(page.getByText('In a call between browsers, a guest and the people in the call can see each other’s network addresses.')).toBeVisible()
  await userEvent.click(page.getByRole('button', { name: 'Let in' }))
  await waitFor(() => expect(panelActions.admit).toHaveBeenCalledWith('g1'))
  await userEvent.click(page.getByRole('button', { name: 'Microphone only' }))
  await userEvent.click(page.getByRole('button', { name: 'Create guest link' }))
  await waitFor(() => expect(panelActions.link).toHaveBeenCalledWith({ publish: ['microphone'] }))
  expect(await page.findByRole('textbox', { name: 'Copy link' })).toHaveValue('https://chat.example.com/-/call-guest#pbgl_story')
  await userEvent.click(page.getByRole('button', { name: 'Revoke' }))
  await waitFor(() => expect(panelActions.revoke).toHaveBeenCalledWith('l1'))
}

/** A member's guests: one waiting to be let in, one in the call, and the call's guest link. */
export const Panel: StoryObj = { tags: ['play'], render: panel(panelActions), play: panelPlay }
export const PanelOnPhone: StoryObj = { ...phone, tags: ['play', 'phone'], render: panel(panelActions), play: panelPlay }

const noticeActions = guests()
const waitingStage = () => (
  <div className="h-[100dvh]">
    <CallStage
      people={[storyPerson('ann', 'Ann Lee', 20, { self: true }), storyPerson('bob', 'Bob Stone', 140)]}
      state="joined"
      aside={<CallLobbyNotice waiting={[{ guest: 'g1', name: 'Eve Park', since: '' }]} guests={noticeActions} />}
      controls={{ microphoneOn: true, cameraOn: true, onMicrophone: fn(), onCamera: fn(), guests: { waiting: 1, onOpen: fn() }, leave: { href: '/conversations/7' } }}
    />
  </div>
)
const waitingStagePlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  expect(canvas.getByText('Eve Park is waiting to join')).toBeVisible()
  expect(canvas.getByRole('button', { name: 'Guests' })).toHaveTextContent('1')
  await userEvent.click(canvas.getByRole('button', { name: 'Let in' }))
  await waitFor(() => expect(noticeActions.admit).toHaveBeenCalledWith('g1'))
}

/** In the call, someone waits in the lobby: the member lets them in without opening the guests. */
export const GuestWaitingInCall: StoryObj = { tags: ['play'], render: waitingStage, play: waitingStagePlay }
export const GuestWaitingInCallOnPhone: StoryObj = { ...phone, tags: ['play', 'phone'], render: waitingStage, play: waitingStagePlay }

const namePlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  expect(canvas.getByText(/You are invited to a call/)).toBeVisible()
  const next = canvas.getByRole('button', { name: 'Continue' })
  expect(next).toBeDisabled()
  await userEvent.type(canvas.getByRole('textbox', { name: 'Your name' }), 'Eve Park')
  expect(next).toBeEnabled()
}

/** The page a guest link opens: the guest's name first, before their microphone and camera. */
export const GuestName: StoryObj = { tags: ['play'], render: () => <GuestCallPage link="pbgl_story" systemPath="/api" base="https://chat.example.com" />, play: namePlay }
export const GuestNameOnPhone: StoryObj = { ...phone, tags: ['play', 'phone'], render: GuestName.render!, play: namePlay }

const waitPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  expect(canvas.getByText('Waiting for someone in the call to let you in…')).toBeVisible()
  expect(canvas.getByRole('link', { name: 'Leave' })).toHaveAttribute('href', 'https://chat.example.com/-/call-guest#pbgl_story')
}

/** The guest waits in the lobby. */
export const GuestWaiting: StoryObj = { tags: ['play'], render: () => <div className="h-[100dvh]"><CallWaiting leave={{ href: 'https://chat.example.com/-/call-guest#pbgl_story' }} /></div>, play: waitPlay }
export const GuestWaitingOnPhone: StoryObj = { ...phone, tags: ['play', 'phone'], render: GuestWaiting.render!, play: waitPlay }

/** Nobody let the guest in: no way to ask again from here. */
export const GuestDenied: StoryObj = {
  tags: ['play'],
  render: () => <div className="h-[100dvh]"><CallMessage reason="denied" onJoinAgain={fn()} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Nobody in the call let you in')).toBeVisible()
    expect(canvas.queryByRole('button', { name: 'Join again' })).toBeNull()
  },
}
