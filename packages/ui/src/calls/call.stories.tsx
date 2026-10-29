import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { CallCheck } from './call-check'
import { CallMessage } from './call-message'
import type { CallPerson } from './call-person'
import { CallStage } from './call-stage'
import { canvasTrack, storyPerson } from './testing/story-tracks'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const
const meta = { title: 'Components/Call', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

// The play runner opens a story tagged `phone` at a phone's size; the toolbar's viewport shows it so in Storybook.
const phone = { globals: { viewport: { value: 'mobile360' } } }
const leave = { href: '/conversations/7' }
const controls = { microphoneOn: true, cameraOn: true, onMicrophone: fn(), onCamera: fn(), onShare: fn(), leave }

const team = (): CallPerson[] => [
  storyPerson('ann', 'Ann Lee', 20, { self: true }),
  storyPerson('bob', 'Bob Stone', 140, { speaking: true }),
  storyPerson('cat', 'Cat Vos', 260, { microphoneOff: true, connection: 'poor' }),
  storyPerson('dan', 'Dan Moss', 320, { camera: undefined, cameraOff: true, connection: 'failed' }),
]

const stage = (people: () => CallPerson[], more: Partial<Parameters<typeof CallStage>[0]> = {}) => () => (
  <div className="h-[100dvh]">
    <CallStage people={people()} state="joined" controls={controls} {...more} />
  </div>
)

// Every tile lies inside the view: nothing is cut off or pushes the page to scroll.
const allInside = (canvasElement: HTMLElement) => {
  const view = canvasElement.querySelector('section')!.getBoundingClientRect()
  for (const tile of canvasElement.querySelectorAll('figure')) {
    const box = tile.getBoundingClientRect()
    expect(box.bottom).toBeLessThanOrEqual(view.bottom + 1)
    expect(box.right).toBeLessThanOrEqual(view.right + 1)
  }
}

const gridPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  expect(canvasElement.querySelector('section')).toHaveAttribute('data-layout', 'grid')
  expect(canvas.getAllByRole('figure')).toHaveLength(4)
  expect(canvas.getByRole('figure', { name: 'Ann Lee (You)' })).toBeVisible()
  expect(canvas.getByRole('figure', { name: 'Bob Stone' })).toHaveAttribute('data-speaking', 'true')
  const cat = within(canvas.getByRole('figure', { name: 'Cat Vos' }))
  expect(cat.getByRole('img', { name: 'Muted' })).toBeVisible()
  expect(cat.getByRole('img', { name: 'Poor connection' })).toBeVisible()
  expect(canvas.getByText('Cannot connect to Dan Moss')).toBeVisible()
  expect(canvas.getByRole('link', { name: 'Leave' })).toHaveAttribute('href', '/conversations/7')
  await userEvent.click(canvas.getByRole('button', { name: 'Microphone' }))
  expect(controls.onMicrophone).toHaveBeenCalled()
  allInside(canvasElement)
}

/** Four people at the same size: the one speaking ringed, one muted on a poor connection, one the browser cannot connect to. */
export const Grid: StoryObj = {
  tags: ['play'],
  render: stage(team),
  play: async (context) => {
    await gridPlay(context)
    const [first, second] = within(context.canvasElement).getAllByRole('figure').map((tile) => tile.getBoundingClientRect())
    // Two columns on a desktop's width: the second tile beside the first.
    expect(second!.top).toBe(first!.top)
  },
}

/** The same call on a phone: two columns, every tile on screen, the controls under them. */
export const GridOnPhone: StoryObj = { ...phone, tags: ['play', 'phone'], render: stage(team), play: gridPlay }

const sharing = () => team().map((person) => (person.member === 'bob' ? { ...person, screen: canvasTrack('Quarterly plan', 200, { width: 1280, height: 720 }) } : person))

const sharePlay = (narrow: boolean) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  expect(canvasElement.querySelector('section')).toHaveAttribute('data-layout', 'share')
  const share = canvas.getByRole('figure', { name: 'Bob Stone is sharing their screen' }).getBoundingClientRect()
  const strip = canvas.getByRole('figure', { name: 'Ann Lee (You)' }).getBoundingClientRect()
  // Beside the share on a desktop, under it on a phone.
  if (narrow) expect(strip.top).toBeGreaterThanOrEqual(share.bottom)
  else expect(strip.left).toBeGreaterThanOrEqual(share.right)
  expect(share.width).toBeGreaterThan(strip.width * 2)
  allInside(canvasElement)
}

/** A screen share large, with the people in a strip beside it. */
export const ScreenShare: StoryObj = { tags: ['play'], render: stage(sharing, { controls: { ...controls, sharing: false } }), play: sharePlay(false) }

/** The screen share on a phone: the people in a row under it. */
export const ScreenShareOnPhone: StoryObj = { ...phone, tags: ['play', 'phone'], render: stage(sharing), play: sharePlay(true) }

const alone = () => [storyPerson('ann', 'Ann Lee', 20, { self: true })]

const alonePlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  expect(canvasElement.querySelector('section')).toHaveAttribute('data-layout', 'alone')
  expect(canvas.getByText('You are the only one here')).toBeVisible()
  allInside(canvasElement)
}

/** The member alone in the call, waiting for the others. */
export const Alone: StoryObj = { tags: ['play'], render: stage(alone), play: alonePlay }
export const AloneOnPhone: StoryObj = { ...phone, tags: ['play', 'phone'], render: stage(alone), play: alonePlay }

/** Reconnecting while the link to the server is restored; the call goes on. */
export const Reconnecting: StoryObj = {
  tags: ['play'],
  render: stage(team, { state: 'resuming' }),
  play: async ({ canvasElement }) => expect(within(canvasElement).getByText('Reconnecting…')).toBeVisible(),
}

const fullPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  expect(canvas.getByRole('status')).toHaveTextContent('This call is full')
  expect(canvas.getByRole('button', { name: 'Join again' })).toBeVisible()
}

/** A call already full: said in plain words, with a way to try again. */
export const Full: StoryObj = { tags: ['play'], render: () => <div className="h-[100dvh]"><CallMessage reason="full" onJoinAgain={fn()} /></div>, play: fullPlay }
export const FullOnPhone: StoryObj = { ...phone, tags: ['play', 'phone'], render: Full.render!, play: fullPlay }

const refused = () => (
  <div className="h-[100dvh]">
    <CallCheck name="Ann Lee" member="ann" microphoneOn cameraOn microphone cameraAvailable={false} notices={['Your camera is blocked: allow it in the browser to be seen.']} onMicrophone={fn()} onCamera={fn()} onJoin={fn()} cancel={leave} />
  </div>
)

const refusedPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement)
  expect(canvas.getByText('Your camera is blocked: allow it in the browser to be seen.')).toBeVisible()
  expect(canvas.getByRole('button', { name: 'Camera' })).toBeDisabled()
  expect(canvas.getByRole('button', { name: 'Microphone' })).toBeEnabled()
  await waitFor(() => expect(canvas.getByRole('button', { name: 'Join call' })).toBeVisible())
}

/** The check before joining, with the camera blocked: the member joins with their microphone alone. */
export const RefusedCamera: StoryObj = { tags: ['play'], render: refused, play: refusedPlay }
export const RefusedCameraOnPhone: StoryObj = { ...phone, tags: ['play', 'phone'], render: refused, play: refusedPlay }
