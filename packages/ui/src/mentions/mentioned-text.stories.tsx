import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, type Mock, userEvent, waitFor, within } from 'storybook/test'
import { lazyPart } from '../lib/lazy-part'
import { AsWritten, loadMessageContent } from './mentioned-text'

const meta = { title: 'Mentions/Message text that does not load', parameters: { layout: 'padded' } } satisfies Meta
export default meta

const ann = { name: 'Ann de Vries' }
const body = '**Heads up @Ann de Vries:** the reset is _done_.\nCheck https://status.example.com'

// What the browser's import gives when the renderer's chunk does not load, such as offline or after an update
const offline = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/message-content.js'))

type Args = { load: () => ReturnType<typeof loadMessageContent>; report: () => void }

/** A renderer that does not load, then loads: messages read as typed, mentions picked out, and all show formatted once a third is drawn. */
export const DoesNotLoad: StoryObj<Args> = {
  tags: ['play'],
  args: { load: fn(), report: fn() },
  beforeEach: ({ args }) => {
    (args.load as Mock<Args['load']>).mockImplementationOnce(offline).mockImplementation(loadMessageContent)
  },
  render: function Render({ load, report }) {
    const [Text] = useState(() => lazyPart(load, AsWritten, report))
    const [more, setMore] = useState(false)
    return (
      <div>
        {[1, 2].map((key) => (
          <div key={key} data-testid="message">
            <Text text={body} mentions={[ann]} />
          </div>
        ))}
        {more && (
          <div data-testid="message">
            <Text text={body} mentions={[ann]} />
          </div>
        )}
        <button type="button" onClick={() => setMore(true)}>
          Show another
        </button>
      </div>
    )
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    // Both as typed, mentions picked out, no error in their place, and the failure reported once
    await waitFor(() => expect(args.report).toHaveBeenCalledTimes(1))
    for (const message of canvas.getAllByTestId('message')) {
      expect(message.textContent).toBe(body)
      expect(within(message).getByText('@Ann de Vries')).toHaveClass('text-primary')
      expect(message.querySelector('strong')).toBeNull()
    }
    expect(canvas.queryByRole('alert')).toBeNull()
    // A third message drawn imports again, and once it loads all three show formatted
    await userEvent.click(canvas.getByRole('button', { name: 'Show another' }))
    for (const formatted of canvas.getAllByTestId('message')) {
      await within(formatted).findByText('done', { selector: 'em' })
      expect(within(formatted).getByText('@Ann de Vries').closest('strong')).not.toBeNull()
      expect(within(formatted).getByRole('link', { name: 'https://status.example.com' })).toBeVisible()
    }
    expect(args.load).toHaveBeenCalledTimes(2)
    expect(args.report).toHaveBeenCalledTimes(1)
  },
}

type WaitArgs = { fails: boolean }

// The renderer's chunk arriving a moment after the page, or not at all
const slowly = (fails: boolean) => () =>
  new Promise<void>((resolve) => setTimeout(resolve, 300)).then(() => (fails ? offline() : loadMessageContent()))

/** A page that shows its messages only once the renderer has loaded or failed to: they show formatted from the first frame, or as typed. */
export const PageWaitsForTheRenderer: StoryObj<WaitArgs> = {
  tags: ['play'],
  args: { fails: false },
  render: function Render({ fails }) {
    const [Text] = useState(() => lazyPart(slowly(fails), AsWritten, () => {}))
    const loaded = Text.useLoaded()
    if (!loaded) return <p>Loading messages</p>
    return (
      <div data-testid="message">
        <Text text={body} mentions={[ann]} />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Loading messages')).toBeVisible()
    const message = await canvas.findByTestId('message')
    // Drawn in the same frame the page shows it, never as typed first
    expect(message.querySelector('strong')).not.toBeNull()
  },
}

/** When the renderer does not load, the page that waits on it still shows its messages, as typed. */
export const PageWaitsForARendererThatFails: StoryObj<WaitArgs> = {
  tags: ['play'],
  args: { fails: true },
  render: PageWaitsForTheRenderer.render,
  play: async ({ canvasElement }) => {
    const message = await within(canvasElement).findByTestId('message')
    expect(message.textContent).toBe(body)
    expect(message.querySelector('strong')).toBeNull()
  },
}
