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

/** A renderer that does not load, then loads: the message reads as typed, mentions picked out, and shows formatted once drawn again. */
export const DoesNotLoad: StoryObj<Args> = {
  tags: ['play'],
  args: { load: fn(), report: fn() },
  beforeEach: ({ args }) => {
    (args.load as Mock<Args['load']>).mockImplementationOnce(offline).mockImplementation(loadMessageContent)
  },
  render: function Render({ load, report }) {
    const [Text] = useState(() => lazyPart(load, AsWritten, report))
    const [drawn, setDrawn] = useState(1)
    return (
      <div>
        <div key={drawn} data-testid="message">
          <Text text={body} mentions={[ann]} />
        </div>
        <button type="button" onClick={() => setDrawn(drawn + 1)}>
          Draw again
        </button>
      </div>
    )
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const message = canvas.getByTestId('message')
    // As typed, the mention picked out, no error in its place, and the failure reported once
    await waitFor(() => expect(args.report).toHaveBeenCalledTimes(1))
    expect(message.textContent).toBe(body)
    expect(within(message).getByText('@Ann de Vries')).toHaveClass('text-primary')
    expect(message.querySelector('strong')).toBeNull()
    expect(canvas.queryByRole('alert')).toBeNull()
    // Drawn again, it imports again and shows the formatted text
    await userEvent.click(canvas.getByRole('button', { name: 'Draw again' }))
    const formatted = canvas.getByTestId('message')
    await within(formatted).findByText('done', { selector: 'em' })
    expect(within(formatted).getByText('@Ann de Vries').closest('strong')).not.toBeNull()
    expect(within(formatted).getByRole('link', { name: 'https://status.example.com' })).toBeVisible()
    expect(args.load).toHaveBeenCalledTimes(2)
    expect(args.report).toHaveBeenCalledTimes(1)
  },
}
