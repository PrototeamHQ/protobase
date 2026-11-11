import type { Meta, StoryObj } from '@storybook/react-vite'
import { LayoutDashboard } from 'lucide-react'
import { expect, waitFor, within } from 'storybook/test'
import { SidebarItem } from '../app-shell/sidebar-item'
import { Button } from './button'

const meta = { title: 'Primitives/Press', parameters: { layout: 'padded' } } satisfies Meta
export default meta

// A real finger held on the page for `ms`, which the play-tests runner gives "touch" stories (scripts/play-tests/touch-input.mjs)
const press = (at: { x: number; y: number; ms: number }) => (window as unknown as { pbPress: (at: { x: number; y: number; ms: number }) => Promise<void> }).pbPress(at)

const Pressables = () => (
  <div className="flex w-72 flex-col gap-3">
    <SidebarItem item={{ id: 'today', label: 'Today', icon: LayoutDashboard, href: '#today' }} mode="text-large" active={false} />
    <Button variant="primary">Save</Button>
    <Button>Cancel</Button>
    <div role="row" data-pressable="" className="flex items-center justify-between rounded-md border p-3">
      A row that opens its record <a href="#title">Title</a>
    </div>
    <Button disabled>Disabled</Button>
  </div>
)

/** Each element darkens a little while pressed: a sidebar item, buttons and a row that opens its record. */
export const Default: StoryObj = { render: () => <Pressables /> }

const tinted = (element: Element) => getComputedStyle(element).backgroundImage.includes('gradient')

// Held for 600 ms: the tint shows while the finger is down and clears once it lifts
const pressing = async (element: Element) => {
  const box = element.getBoundingClientRect()
  await press({ x: box.left + 4, y: box.top + box.height / 2, ms: 600 })
}

/** A finger on an element tints it, the inner one alone when pressables nest, and lifting it clears the tint. */
export const PressChecks: StoryObj = {
  tags: ['play', 'touch', '!dev'],
  name: 'Tints what a finger presses (checks)',
  render: () => <Pressables />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const item = canvas.getByRole('link', { name: 'Today' })
    const save = canvas.getByRole('button', { name: 'Save' })
    const row = canvas.getByRole('row')
    const title = canvas.getByRole('link', { name: 'Title' })

    // No grey box from the browser and no wait for a double tap
    for (const element of [item, save, row]) {
      expect(getComputedStyle(element).touchAction).toBe('manipulation')
      expect(getComputedStyle(element).getPropertyValue('-webkit-tap-highlight-color')).toBe('rgba(0, 0, 0, 0)')
    }

    for (const element of [item, save, row]) {
      expect(tinted(element)).toBe(false)
      await pressing(element)
      await waitFor(() => expect(tinted(element)).toBe(true))
      await waitFor(() => expect(tinted(element)).toBe(false))
    }

    await pressing(title)
    await waitFor(() => expect(tinted(title)).toBe(true))
    expect(tinted(row)).toBe(false)
    await waitFor(() => expect(tinted(title)).toBe(false))

    const disabled = canvas.getByRole('button', { name: 'Disabled' })
    await pressing(disabled)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(tinted(disabled)).toBe(false)
  },
}
