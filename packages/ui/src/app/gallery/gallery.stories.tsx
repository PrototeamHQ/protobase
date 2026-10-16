import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { App } from '../app'
import { fakeApi } from '../testing/fake-api'
import { forbidden } from '../testing/fake-client'
import { homeResources, homeRows, homeViews } from '../testing/homes-domain'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Record page/Gallery', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
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

    // Arrows, keys and a swipe step through them, wrapping around
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next photo' }))
    await counter(dialog, '3 / 8')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    await counter(dialog, '8 / 8')
    await userEvent.keyboard('{ArrowRight}')
    await counter(dialog, '1 / 8')
    const stage = dialog.querySelector('img')!.parentElement!
    stage.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 300, clientY: 200, bubbles: true }))
    stage.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', clientX: 180, clientY: 210, bubbles: true }))
    await counter(dialog, '2 / 8')

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
  },
}

export const PhotoDetailsChecks: StoryObj = {
  ...PhotoDetails,
  name: "A photo's details beside it, for a user who may read them (checks)",
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const photos = await gallery(canvasElement)
    // The cover is the first photo record, so it has its details too, in a sidebar right of the photo with no button to press
    await userEvent.click(await within(photos).findByRole('button', { name: 'Show photo 1 of 8' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Photos' })
    const sidebar = within(dialog).getByRole('complementary', { name: 'Photo details' })
    expect(within(dialog).queryByRole('button', { name: 'Photo details' })).toBeNull()
    expect(await within(sidebar).findByText('Front')).toBeVisible()
    expect(sidebar.querySelector('dl')).not.toBeNull()
    expect(sidebar.getBoundingClientRect().left).toBeGreaterThanOrEqual(dialog.querySelector('img')!.parentElement!.getBoundingClientRect().right)
    expect(within(sidebar).getByRole('link', { name: 'Open photo' }).getAttribute('href')).toBe('/home_photos/11')

    // They follow the photo shown
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next photo' }))
    expect(await within(sidebar).findByText('Living room')).toBeVisible()
    expect(within(sidebar).getByRole('link', { name: 'Open photo' }).getAttribute('href')).toBe('/home_photos/12')
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
    // The plain lightbox: the photo alone
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
  name: "A photo's details below it on a mobile screen",
  globals: { viewport: { value: 'mobile360' } },
  render: () => <Home />,
  play: PhotoDetails.play,
}

export const MobilePhotoDetailsChecks: StoryObj = {
  ...MobilePhotoDetails,
  name: "A photo's details below it on a mobile screen (checks)",
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const photos = await gallery(canvasElement)
    await userEvent.click(await within(photos).findByRole('button', { name: 'Show photo 1 of 8' }))
    const dialog = await canvas.findByRole('dialog', { name: 'Photos' })
    const sidebar = within(dialog).getByRole('complementary', { name: 'Photo details' })
    expect(await within(sidebar).findByText('Front')).toBeInTheDocument()
    // Below the photo, across the screen, reached by scrolling the dialog
    const photo = dialog.querySelector('img')!.parentElement!.getBoundingClientRect()
    const box = sidebar.getBoundingClientRect()
    expect(box.top).toBeGreaterThanOrEqual(photo.bottom)
    expect(box.width).toBe(dialog.clientWidth)
    expect(dialog.scrollWidth).toBe(dialog.clientWidth)
  },
}
