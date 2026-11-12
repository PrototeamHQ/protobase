import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession, type ResourcePermissions } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { defineUi } from '@protobase/ui'
import { App } from '@protobase/ui/unstable/app/app'
import { fakeApi } from '@protobase/ui/unstable/app/testing/fake-api'
import pdfViewer from './index'
import { jpxPdf, samplePdf } from './testing/sample-pdf'

const meta = { title: 'Plugins/PDF viewer', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

const attachments = resource('attachments')
  .table('attachments')
  .fields({ id: f.integer().readOnly().filterable().sortable(), file: f.file() })
  .primaryKey((r) => r.id)

const attachmentsView = view<typeof attachments>('attachments').names({ singular: 'File', plural: 'Files' }).list((r) => ({ columns: [r.file] }))

const pdfUrl = samplePdf(['Lease agreement', 'Terms', 'Signatures'])

const rows = {
  attachments: [
    { id: 1, file: { uri: 'private:1/a.pdf?name=lease.pdf&size=900', name: 'lease.pdf', type: 'application/pdf', size: 900, url: pdfUrl } },
    { id: 2, file: { uri: 'private:1/b.pdf?name=broken.pdf&size=9', name: 'broken.pdf', type: 'application/pdf', size: 9, url: `data:application/pdf;base64,${btoa('not a pdf')}` } },
    { id: 3, file: { uri: 'private:1/c.pdf?name=scan.pdf&size=700', name: 'scan.pdf', type: 'application/pdf', size: 700, url: jpxPdf() } },
  ],
}

const permissions: Record<string, ResourcePermissions> = { attachments: { read: true, create: true, update: true, delete: false, conditional: [] } }

// The app attaches the plugin as an app's protobase.ui.tsx does.
const Files = ({ path }: { path: string }) => {
  const [api] = useState(() => fakeApi({ resources: [attachments.toModel()], views: [attachmentsView.toModel()], rows, permissions }))
  const ui = defineUi({ extends: [pdfViewer] })
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl={path} ui={ui} />
    </div>
  )
}

// The pixels of a page's canvas; none once it has let them go.
const pixelsOf = (page: HTMLElement) => {
  const canvas = page as HTMLCanvasElement
  if (canvas.width === 0 || canvas.height === 0) return new Uint8ClampedArray()
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
}

// Whether pdf.js has drawn anything dark on the page's canvas, such as its line of text.
const drawn = (page: HTMLElement) => {
  const pixels = pixelsOf(page)
  for (let index = 0; index < pixels.length; index += 4) if (pixels[index]! < 128 && pixels[index + 3]! > 0) return true
  return false
}

// Whether the middle of the page's canvas is the scan's green.
const green = (page: HTMLElement) => {
  const canvas = page as HTMLCanvasElement
  const pixels = pixelsOf(page)
  const middle = (Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2)) * 4
  return pixels.length > 0 && pixels[middle]! < 60 && pixels[middle + 1]! > 120 && pixels[middle + 2]! < 60
}

/**
 * A PDF's link on its record opens it in the viewer, the pages one under the other, each drawn as it comes near and let
 * go when it moves away.
 */
export const OpenAPdf: StoryObj = {
  tags: ['play'],
  render: () => <Files path="/attachments/1" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('link', { name: 'lease.pdf' }))
    const first = await canvas.findByRole('img', { name: 'Page 1 of 3' })
    const last = canvas.getByRole('img', { name: 'Page 3 of 3' })
    await waitFor(() => expect(drawn(first)).toBe(true))
    // The last page is two pages, more than two screens, below the first, so it is drawn only once scrolled to.
    expect(drawn(last)).toBe(false)
    last.scrollIntoView()
    await waitFor(() => expect(drawn(last)).toBe(true))
    // The first page is now two pages above the screen: its canvas holds no pixels, and it keeps its place.
    await waitFor(() => expect((first as HTMLCanvasElement).width).toBe(0))
    expect(first.getBoundingClientRect().height).toBeGreaterThan(0)
    expect(first.getBoundingClientRect().bottom).toBeLessThanOrEqual(canvas.getByRole('img', { name: 'Page 2 of 3' }).getBoundingClientRect().top)
  },
}

/** On a phone, a page is as wide as the screen allows and keeps its A4 shape. */
export const OnAPhone: StoryObj = {
  tags: ['play', 'phone'],
  render: () => <Files path="/attachments/1?file=file" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = await canvas.findByRole('img', { name: 'Page 1 of 3' })
    await waitFor(() => expect(drawn(first)).toBe(true))
    const { width, height, right } = first.getBoundingClientRect()
    expect(right).toBeLessThanOrEqual(window.innerWidth)
    expect(height / width).toBeCloseTo(842 / 595, 1)
  },
}

/** A scanned page, a JPEG 2000 image, is drawn with pdf.js's decoder, which the viewer brings. */
export const ScannedPage: StoryObj = {
  tags: ['play'],
  render: () => <Files path="/attachments/3?file=file" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const page = await canvas.findByRole('img', { name: 'Page 1 of 1' })
    await waitFor(() => expect(green(page)).toBe(true))
  },
}

/** A file pdf.js cannot read leaves its download in the viewer's place. */
export const PdfThatFails: StoryObj = {
  tags: ['play'],
  render: () => <Files path="/attachments/2?file=file" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('alert')).toHaveTextContent('broken.pdf could not be shown here.')
  },
}
