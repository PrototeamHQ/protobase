import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Carousel } from './carousel'

// A screenshot stand-in: a header bar and a body in its own colour, drawn as a PNG.
const screenshot = (hue: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 200
  const context = canvas.getContext('2d')!
  context.fillStyle = `hsl(${hue} 50% 92%)`
  context.fillRect(0, 0, 320, 200)
  context.fillStyle = `hsl(${hue} 45% 45%)`
  context.fillRect(0, 0, 320, 28)
  return canvas.toDataURL('image/png')
}

const board = screenshot(210)
const shots = [
  { src: board, alt: 'The repairs board' },
  { uri: 'public:presets/list.png', name: 'list.png', type: 'image/png', size: 2048, url: screenshot(30), alt: 'The repairs list' },
  { src: screenshot(130), alt: 'A repair' },
]

const meta = {
  title: 'Components/Carousel',
  component: Carousel,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div className="w-[320px]"><Story /></div>],
  args: { images: shots, label: 'Bike repairs', fit: 'contain', className: 'aspect-[8/5] rounded-lg border border-border bg-muted' },
} satisfies Meta<typeof Carousel>

export default meta
type Story = StoryObj<typeof meta>

export const Screenshots: Story = {}

export const ScreenshotsChecks: Story = {
  name: 'Screenshots (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const carousel = canvas.getByRole('group', { name: 'Bike repairs' })
    const track = carousel.querySelector<HTMLElement>('[data-carousel-track]')!

    // Links and file values both draw, in their order, with what each shows
    const images = within(track).getAllByRole('img')
    expect(images.map((image) => image.getAttribute('alt'))).toEqual(['The repairs board', 'The repairs list', 'A repair'])
    expect(images[0]!.getAttribute('src')).toBe(board)
    expect(canvas.getByText('Photo 1 of 3')).toBeTruthy()

    // The arrows show on hover, step through the images and wrap around
    expect(getComputedStyle(canvas.getByRole('button', { name: 'Next photo' })).opacity).toBe('0')
    await userEvent.click(canvas.getByRole('button', { name: 'Next photo' }))
    await waitFor(() => expect(canvas.getByText('Photo 2 of 3')).toBeTruthy())
    expect(track.scrollLeft).toBeGreaterThan(0)
    await userEvent.click(canvas.getByRole('button', { name: 'Previous photo' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Previous photo' }))
    await waitFor(() => expect(canvas.getByText('Photo 3 of 3')).toBeTruthy())

    // A swipe is a scroll of the track, which the dots follow
    expect(getComputedStyle(track).overflowX).toBe('auto')
    track.scrollTo({ left: 0, behavior: 'instant' })
    await waitFor(() => expect(canvas.getByText('Photo 1 of 3')).toBeTruthy())
  },
}

export const OneImage: Story = { name: 'One image', args: { images: shots.slice(0, 1) } }

export const OneImageChecks: Story = {
  ...OneImage,
  name: 'One image (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByRole('img', { name: 'The repairs board' })).toBeTruthy()
    expect(canvas.queryByRole('button', { name: 'Next photo' })).toBeNull()
  },
}
