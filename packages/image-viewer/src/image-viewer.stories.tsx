import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { defineUi } from '@protobase/ui'
import { App } from '@protobase/ui/unstable/app/app'
import { fakeApi } from '@protobase/ui/unstable/app/testing/fake-api'
import imageViewer from './index'
import { sampleImage } from './testing/sample-image'

const meta = { title: 'Plugins/Image viewer', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const attachments = resource('attachments')
  .table('attachments')
  .fields({ id: f.integer().readOnly().filterable().sortable(), file: f.file() })
  .primaryKey((r) => r.id)

const attachmentsView = view<typeof attachments>('attachments').names({ singular: 'File', plural: 'Files' }).list((r) => ({ columns: [r.file] }))

// Wider than any screen the stories play on, so fitting it to the page shrinks it.
const pngUrl = sampleImage(1600, 900)

const rows = {
  attachments: [
    { id: 1, file: { uri: 'private:1/a.png?name=floor-plan.png&size=9741', name: 'floor-plan.png', type: 'image/png', size: 9741, url: pngUrl } },
    { id: 2, file: { uri: 'private:1/b.png?name=broken.png&size=4', name: 'broken.png', type: 'image/png', size: 4, url: 'data:image/png;base64,AAAA' } },
  ],
}

const permissions: Record<string, ResourcePermissions> = { attachments: { read: true, create: true, update: true, delete: false, conditional: [] } }

// The app attaches the plugin as an app's protobase.ui.tsx does.
const Files = ({ path }: { path: string }) => {
  const [api] = useState(() => fakeApi({ resources: [attachments.toModel()], views: [attachmentsView.toModel()], rows, permissions }))
  const ui = defineUi({ extends: [imageViewer] })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} ui={ui} />
    </div>
  )
}

/** An image's link on its record opens it in the viewer, fitted to the page, and at its actual size on request. */
export const OpenAnImage: StoryObj = {
  tags: ['play'],
  render: () => <Files path="/attachments/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('link', { name: 'floor-plan.png' }))
    const image = await canvas.findByRole('img', { name: 'floor-plan.png' })
    expect(image).toHaveAttribute('src', pngUrl)
    expect(await canvas.findByText('1600 × 900 pixels')).toBeTruthy()
    expect(image.getBoundingClientRect().width).toBeLessThan(1600)
    const actualSize = canvas.getByRole('button', { name: 'Actual size' })
    await userEvent.click(actualSize)
    expect(actualSize).toHaveAttribute('aria-pressed', 'true')
    expect(canvas.getByRole('img', { name: 'floor-plan.png' }).getBoundingClientRect().width).toBe(1600)
  },
}

/** On a phone, an image is fitted to the screen's width, and at its actual size scrolls in its own box, not the page. */
export const OnAPhone: StoryObj = {
  tags: ['play', 'phone'],
  render: () => <Files path="/attachments/1?file=file" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('1600 × 900 pixels')
    const image = canvas.getByRole('img', { name: 'floor-plan.png' })
    expect(image.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    await userEvent.click(canvas.getByRole('button', { name: 'Actual size' }))
    expect(canvas.getByRole('img', { name: 'floor-plan.png' }).getBoundingClientRect().width).toBe(1600)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  },
}

/** An image the browser cannot draw leaves its download in the viewer's place. */
export const ImageThatFails: StoryObj = {
  tags: ['play'],
  render: () => <Files path="/attachments/2?file=file" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('alert')).toHaveTextContent('broken.png could not be shown here.')
  },
}
