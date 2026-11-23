import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { ChatMessage } from '../chat'
import { AsWritten } from './mentioned-text'
import { MessageContent } from './message-content'

const meta = { title: 'Mentions/Message text layout', parameters: { layout: 'padded' } } satisfies Meta
export default meta

const ann = { name: 'Ann de Vries' }
const texts = [
  'Works for me.',
  'One line\nand the next',
  'A paragraph.\n\n\nAnother, after blank lines.\n',
  // Short enough not to wrap in any font, since bold text and visible marks change where a line wraps
  '**Done**, _see_ `ok`',
  'Thanks @Ann de Vries, see https://status.example.com',
  'A longer message that wraps over several lines in a narrow column, with an address https://example.com in it and @Ann de Vries named.',
]

// Each text as written beside the same text rendered, in a person's message as a page shows them, narrow and wide
const widths = [280, 640]

/**
 * The text a message shows while its renderer loads takes the same room as the rendered text, at any width: lines,
 * paragraphs, mentions, links and inline formatting that leaves its line where it was.
 */
export const SameRoomBeforeAndAfter: StoryObj = {
  tags: ['play'],
  render: () => (
    <div className="flex flex-col gap-6">
      {widths.map((width) =>
        texts.map((text, index) => (
          <div key={`${width}-${index}`} className="flex items-start gap-4" style={{ width: width * 2 + 16 }}>
            {[AsWritten, MessageContent].map((Text, side) => (
              <div key={side} data-testid={side === 0 ? 'as-written' : 'rendered'} style={{ width }}>
                <ChatMessage author={{ id: 'ann', name: 'Ann de Vries' }} time="2026-11-23T09:30:00Z" continued={false}>
                  <Text text={text} mentions={[ann]} />
                </ChatMessage>
              </div>
            ))}
          </div>
        )),
      )}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const asWritten = [...canvasElement.querySelectorAll<HTMLElement>('[data-testid="as-written"]')]
    const rendered = [...canvasElement.querySelectorAll<HTMLElement>('[data-testid="rendered"]')]
    await waitFor(() => expect(rendered[3]!.querySelector('strong')).not.toBeNull())
    expect(rendered).toHaveLength(asWritten.length)
    rendered.forEach((box, index) => {
      const before = asWritten[index]!.getBoundingClientRect()
      const after = box.getBoundingClientRect()
      expect({ index, width: after.width, height: after.height }).toEqual({ index, width: before.width, height: before.height })
    })
  },
}
