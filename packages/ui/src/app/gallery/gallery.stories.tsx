import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'
import { forbidden } from '../testing/fake-client'
import { homeResources, homeRows, homeViews } from '../testing/homes-domain'
import { detailsOpenStorageKey } from './details-open-storage'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

// Each story starts with the details closed, whatever an earlier one left open in this browser
const meta = {
  title: 'Record page/Gallery',
  parameters: { layout: 'fullscreen', viewport: { options: viewports } },
  beforeEach: () => localStorage.removeItem(detailsOpenStorageKey),
} satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'ada', email: 'ada@homes.example', name: 'Ada', role: 'admin' })

/** An admin reads the photos' records; a visitor's `/meta` says they may not, though the photos show. */
const permissions = (readsPhotos: boolean): Record<string, ResourcePermissions> => ({
  homes: { read: true, create: false, update: false, delete: false, conditional: [] },
  home_photos: { read: readsPhotos, create: false, update: false, delete: false, conditional: [] },
})

const Home = ({ readsPhotos = true, refuses = false }: { readsPhotos?: boolean; refuses?: boolean }) => {
  const [client] = useState(() => {
    const api = fakeApi({ resources: homeResources, views: homeViews('read'), rows: homeRows(), permissions: permissions(readsPhotos) })
    // The server has the last word on a photo's record, whatever `/meta` let the page offer
    const get: typeof api.client.get = (resource, key) => (refuses && resource === 'home_photos' ? Promise.reject(forbidden('You may not read photos.')) : api.client.get(resource, key))
    return { ...api.client, get }
  })
  return (
    <div className="h-screen">
      <App client={client} auth={session} initialUrl="/homes/1" />
    </div>
  )
}

const gallery = async (canvasElement: HTMLElement) => (await within(canvasElement).findByRole('heading', { name: 'Photos' })).closest('section')!

const counter = (dialog: HTMLElement, text: string) => waitFor(() => expect(within(dialog).getByText(text)).toBeVisible())

export const Gallery: StoryObj = { name: 'Tiles and lightbox', render: () => <Home /> }

export const GalleryChecks: StoryObj = {
  ...Gallery,
  name: 'Tiles and lightbox (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const photos = await gallery(canvasElement)
    // Eight photos, the cover among them once: five tiles, the last counting the three not drawn
    await waitFor(() => expect(within(photos).getAllByRole('button')).toHaveLength(5))
    const all = within(photos).getByRole('button', { name: 'Show all 8 photos' })
    expect(all.textContent).toContain('+3')

    // A tile opens the lightbox at its photo
    await userEvent.click(within(photos).getByRole('button', { name: 'Show photo 2 of 8' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Photos' })
    await counter(dialog, '2 / 8')
    expect(dialog.querySelector('img')).not.toBeNull()

    // Arrows, keys and a swipe step through them
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next photo' }))
    await counter(dialog, '3 / 8')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    await counter(dialog, '1 / 8')
    const stage = dialog.querySelector('img')!.parentElement!
    const swipe = async (from: number, to: number) => {
      stage.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: from, clientY: 200, bubbles: true }))
      stage.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', clientX: to, clientY: 210, bubbles: true }))
    }
    await swipe(300, 180)
    await counter(dialog, '2 / 8')

    // The first photo is the first: Previous, the left key and a swipe right go nowhere
    await userEvent.keyboard('{ArrowLeft}')
    await counter(dialog, '1 / 8')
    const previous = within(dialog).getByRole('button', { name: 'Previous photo' })
    expect(previous.getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(previous)
    await userEvent.keyboard('{ArrowLeft}')
    await swipe(180, 300)
    await counter(dialog, '1 / 8')

    // And the last is the last
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')
    await counter(dialog, '8 / 8')
    const next = within(dialog).getByRole('button', { name: 'Next photo' })
    expect(next.getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(next)
    await userEvent.keyboard('{ArrowRight}')
    await swipe(300, 180)
    await counter(dialog, '8 / 8')
    expect(previous.getAttribute('aria-disabled')).toBe('false')
    await userEvent.click(previous)
    await counter(dialog, '7 / 8')

    // Escape closes it and gives focus back to the tile
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(within(photos).getByRole('button', { name: 'Show photo 2 of 8' }))
  },
}

export const PhotoDetails: StoryObj = {
  name: "A photo's details beside it, for a user who may read them",
  render: () => <Home />,
  play: async ({ canvasElement }) => {
    const photos = await gallery(canvasElement)
    await userEvent.click(await within(photos).findByRole('button', { name: 'Show photo 1 of 8' }))
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Photo details' }))
  },
}

export const PhotoDetailsChecks: StoryObj = {
  name: "A photo's details beside it, for a user who may read them (checks)",
  tags: ['play', '!dev'],
  render: () => <Home />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const photos = await gallery(canvasElement)
    // The details start closed, behind the info button
    await userEvent.click(await within(photos).findByRole('button', { name: 'Show photo 1 of 8' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Photos' })
    const info = within(dialog).getByRole('button', { name: 'Photo details' })
    expect(info.getAttribute('aria-expanded')).toBe('false')
    expect(within(dialog).queryByRole('complementary')).toBeNull()

    // The button opens them in a sidebar right of the photo; the cover is the first photo record, so it has details too
    await userEvent.click(info)
    expect(info.getAttribute('aria-expanded')).toBe('true')
    const sidebar = within(dialog).getByRole('complementary', { name: 'Photo details' })
    expect(info.getAttribute('aria-controls')).toBe(sidebar.id)
    expect(await within(sidebar).findByText('Front')).toBeVisible()
    // A table of labels and values, less the photo's file, which is beside it
    expect([...sidebar.querySelectorAll('dt')].map((label) => label.textContent)).toEqual(['Caption', 'Position'])
    expect(sidebar.getBoundingClientRect().left).toBeGreaterThanOrEqual(dialog.querySelector('img')!.parentElement!.getBoundingClientRect().right)
    expect(within(sidebar).getByRole('link', { name: 'Open photo' }).getAttribute('href')).toBe('/home_photos/11')

    // They follow the photo shown, which still stops at the first
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next photo' }))
    expect(await within(sidebar).findByText('Living room')).toBeVisible()
    expect(within(sidebar).getByRole('link', { name: 'Open photo' }).getAttribute('href')).toBe('/home_photos/12')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    await counter(dialog, '1 / 8')

    // The i key closes and opens them
    await userEvent.keyboard('i')
    await waitFor(() => expect(within(dialog).queryByRole('complementary')).toBeNull())
    expect(info.getAttribute('aria-expanded')).toBe('false')
    await userEvent.keyboard('i')
    expect(await within(dialog).findByRole('complementary', { name: 'Photo details' })).toBeVisible()

    // This browser remembers them open: the lightbox opens with them next time, until they are closed again
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())
    await userEvent.click(within(photos).getByRole('button', { name: 'Show photo 2 of 8' }))
    const again = await canvas.findByRole('dialog', { name: 'Photos' })
    expect(await within(again).findByRole('complementary', { name: 'Photo details' })).toBeVisible()
    await userEvent.click(within(again).getByRole('button', { name: 'Photo details' }))
    expect(localStorage.getItem(detailsOpenStorageKey)).toBeNull()
  },
}

export const NoPhotoDetails: StoryObj = {
  name: 'No details for a user who may not read the photos (checks)',
  tags: ['play', '!dev'],
  render: () => <Home readsPhotos={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const photos = await gallery(canvasElement)
    await userEvent.click(await within(photos).findByRole('button', { name: 'Show photo 2 of 8' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Photos' })
    await counter(dialog, '2 / 8')
    // The plain lightbox: the photo alone, without the info button, and i opens nothing
    expect(within(dialog).queryByRole('button', { name: 'Photo details' })).toBeNull()
    await userEvent.keyboard('i')
    expect(within(dialog).queryByRole('complementary')).toBeNull()
    expect(within(dialog).queryByRole('link', { name: 'Open photo' })).toBeNull()
  },
}

export const PhotoDetailsRefused: StoryObj = {
  name: 'Details the server refuses stay unread (checks)',
  tags: ['play', '!dev'],
  render: () => <Home refuses />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const photos = await gallery(canvasElement)
    await userEvent.click(await within(photos).findByRole('button', { name: 'Show photo 2 of 8' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Photos' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Photo details' }))
    expect(await within(dialog).findByText('Could not load the photo')).toBeVisible()
    expect(within(dialog).getByText('You may not read photos.')).toBeVisible()
    expect(within(dialog).queryByText('Living room')).toBeNull()
  },
}

export const MobileGallery: StoryObj = {
  name: 'Gallery on a mobile screen',
  globals: { viewport: { value: 'mobile360' } },
  render: () => <Home />,
}

export const MobileGalleryChecks: StoryObj = {
  ...MobileGallery,
  name: 'Gallery on a mobile screen (checks)',
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    const photos = await gallery(canvasElement)
    // One large photo with the number of photos; the smaller tiles wait for a wider screen
    const first = await within(photos).findByRole('button', { name: 'Show photo 1 of 8' })
    expect(first.textContent).toContain('8')
    expect(within(photos).getAllByRole('button').filter((tile) => getComputedStyle(tile).display !== 'none')).toEqual([first])
  },
}

export const MobilePhotoDetails: StoryObj = {
  name: "A photo's details in a sheet on a mobile screen",
  globals: { viewport: { value: 'mobile360' } },
  render: () => <Home />,
  play: PhotoDetails.play,
}

export const MobilePhotoDetailsChecks: StoryObj = {
  name: "A photo's details in a sheet on a mobile screen (checks)",
  globals: { viewport: { value: 'mobile360' } },
  tags: ['play', 'phone', '!dev'],
  render: () => <Home />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const photos = await gallery(canvasElement)
    await userEvent.click(await within(photos).findByRole('button', { name: 'Show photo 1 of 8' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Photos' })
    // The photo fills the screen until the info button opens its details
    expect(within(dialog).queryByRole('complementary')).toBeNull()
    expect(dialog.scrollHeight).toBe(dialog.clientHeight)
    const info = within(dialog).getByRole('button', { name: 'Photo details' })
    await userEvent.click(info)

    // A sheet over the lower part of the screen, across it, with the photo's details
    const sheet = await canvas.findByRole('dialog', { name: 'Photo details' })
    expect(await within(sheet).findByText('Front')).toBeVisible()
    const box = sheet.getBoundingClientRect()
    const screen = dialog.getBoundingClientRect()
    expect([box.left, box.right, box.bottom]).toEqual([screen.left, screen.right, screen.bottom])
    expect(box.top).toBeGreaterThan(screen.top)
    expect(within(dialog).queryByRole('complementary')).toBeNull()

    // Escape closes the sheet alone, and gives focus back to the button
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Photo details' })).toBeNull())
    expect(canvas.getByRole('dialog', { name: 'Photos' })).toBeInTheDocument()
    expect(document.activeElement).toBe(info)

    // A swipe down on its header closes it too
    await userEvent.click(info)
    const header = (await canvas.findByRole('dialog', { name: 'Photo details' })).querySelector('header')!
    header.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 180, clientY: 400, bubbles: true }))
    header.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', clientX: 185, clientY: 520, bubbles: true }))
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Photo details' })).toBeNull())
    expect(info.getAttribute('aria-expanded')).toBe('false')
  },
}
